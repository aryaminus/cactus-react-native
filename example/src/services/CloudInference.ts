export interface CloudConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
}

export class CloudInference {
  private baseUrl: string;
  private isConfigured: boolean = false;
  private readonly TIMEOUT_MS = 30000; // 30 seconds for free tier cold starts

  constructor(
    config: CloudConfig = {
      // Default to Render free instance (may be slow to wake up from sleep)
      baseUrl: 'https://dspy-proxy.onrender.com',
    }
  ) {
    this.baseUrl = config.baseUrl;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = this.TIMEOUT_MS
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Cloud service timeout (free tier may be sleeping)');
      }
      throw error;
    }
  }

  async configure(
    provider: string = 'openai',
    model: string = 'gpt-4o-mini',
    apiKey?: string
  ) {
    try {
      console.log('[Cloud] 🔧 Configuring cloud service:', {
        baseUrl: this.baseUrl,
        provider,
        model,
        hasApiKey: !!apiKey,
      });
      await this.fetchWithTimeout(`${this.baseUrl}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, api_key: apiKey }),
      });
      this.isConfigured = true;
      console.log('[Cloud] ✅ Configuration successful');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn('[Cloud] Configuration failed:', errorMessage);

      // Don't assume it's configured if there's a clear error
      if (
        errorMessage.includes('404') ||
        errorMessage.includes('sleeping') ||
        errorMessage.includes('timeout')
      ) {
        console.warn(
          '☁️ Cloud service appears to be down. Local analysis will be used.'
        );
        this.isConfigured = false;
      } else {
        // For other errors, we assume it might be pre-configured
        this.isConfigured = true;
      }
    }
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async registerPIISignature() {
    try {
      await this.fetchWithTimeout(`${this.baseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'pii_detection',
          signature: 'description -> pii_json',
          instructions: `You are a PII detection system. Analyze the image description for personal information.
Detect types:
- credit_card (credit/debit cards, card numbers)
- ssn (social security numbers, tax IDs)
- face (human faces)
- address (physical addresses, not IP)
- email (email addresses)
- phone (phone NUMBERS, not the device itself)

Respond with ONLY valid JSON: {"hasPII":boolean,"confidence":"high"|"medium"|"low","types":string[],"count":number}.

Rules:
1. If you detect PII, set hasPII to true and list types.
2. If the image is just nature, flowers, scenery, or objects without visible PII, return hasPII: false.
3. Do NOT count a "phone" device as PII unless a phone NUMBER is visible.
4. Do NOT count "surface" or "interface" as "face".`,
        }),
      });
    } catch (error) {
      console.warn(
        '[Cloud] Signature registration failed (server may be sleeping):',
        error
      );
    }
  }

  async analyzeDescription(description: string): Promise<any> {
    console.log('[Cloud] 🚀 CLOUD ANALYSIS STARTING');
    if (!this.isConfigured) {
      await this.configure();
      await this.registerPIISignature();
    }

    try {
      console.log('[Cloud] 📤 Sending request to:', this.baseUrl);

      // Create a PII-specific question for the QA signature
      const piiQuestion = `Analyze this image description for Personally Identifiable Information (PII):

"${description}"

Detect these PII types:
- credit_card (credit/debit cards, card numbers)
- ssn (social security numbers, tax IDs, Social Security cards)
- face (human faces in photos)
- address (physical addresses)
- email (email addresses)
- phone (phone numbers visible in text)

Respond with ONLY valid JSON in this exact format:
{"hasPII": true/false, "confidence": "high"/"medium"/"low", "types": ["type1", "type2"], "count": number}

Rules:
1. If PII is detected, set hasPII to true and list specific types
2. If it's just nature, flowers, scenery, or objects without PII, return hasPII: false
3. Use "high" confidence for clear PII like SSN cards, credit cards, or faces
4. Use "medium" for partial/unclear PII
5. Use "low" when no PII is visible

Return ONLY the JSON, no other text.`;

      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/predict`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature_name: 'pii_detection',
            inputs: { description: piiQuestion },
          }),
        },
        45000
      ); // Longer timeout for prediction (45s)

      if (!response.ok) {
        throw new Error(
          `Cloud API error: ${response.status} - Server may be sleeping on free tier`
        );
      }

      const data = await response.json();
      console.log('[Cloud] Raw response:', data);

      // Handle different response formats from your server
      let answer = '';

      if (data.pii_json) {
        // pii_detection signature returns { pii_json: "..." } format
        answer = data.pii_json;
      } else if (data.answer) {
        // qa signature returns { answer: "..." } format
        answer = data.answer;
      } else if (data.prediction) {
        // If server returns { prediction: {...} } format
        return data.prediction;
      } else {
        // Direct response format
        return data;
      }

      answer = answer.trim();

      // Try to extract JSON from the answer
      try {
        // First try: direct parse
        return JSON.parse(answer);
      } catch {
        // Second try: extract JSON from markdown code blocks
        const jsonMatch = answer.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          try {
            return JSON.parse(jsonMatch[1]);
          } catch (e) {
            console.warn('[Cloud] Failed to parse JSON from markdown:', e);
          }
        }

        // Third try: find JSON object in text
        const jsonObjMatch = answer.match(/\{[^{}]*"hasPII"[^{}]*\}/);
        if (jsonObjMatch) {
          try {
            return JSON.parse(jsonObjMatch[0]);
          } catch (e) {
            console.warn('[Cloud] Failed to parse extracted JSON:', e);
          }
        }

        // Fallback: analyze text for PII keywords
        console.warn(
          '[Cloud] Could not parse JSON, using text analysis fallback'
        );
        const lowerAnswer = answer.toLowerCase();
        const hasPII =
          lowerAnswer.includes('haspii": true') ||
          lowerAnswer.includes('social security') ||
          lowerAnswer.includes('credit card') ||
          lowerAnswer.includes('"ssn"') ||
          lowerAnswer.includes('pii detected');

        return {
          hasPII,
          confidence: hasPII ? 'medium' : 'low',
          types: hasPII ? ['ssn'] : [],
          count: hasPII ? 1 : 0,
        };
      }
    } catch (error) {
      console.error('[Cloud] Analysis failed:', error);
      throw error;
    }
  }
}

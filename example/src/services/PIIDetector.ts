export interface PIIResult {
  hasPII: boolean;
  confidence: 'high' | 'medium' | 'low' | 'unknown' | 'error';
  types: string[];
  count: number;
  regions?: Array<{
    type: string;
    coordinates: { x: number; y: number; width: number; height: number };
  }>;
}

export class PIIDetector {
  private textLM: any; // CactusLM instance

  constructor(textLM: any) {
    this.textLM = textLM;
  }

  async analyzeDescription(description: string): Promise<PIIResult> {
    const analysisPrompt = `You are a PII detection expert. Analyze this image description to determine if it contains Personally Identifiable Information (PII).

<description>
${description}
</description>

PII Types to Detect:
- credit_card: Credit/debit card numbers, CVV codes, card visuals
- ssn: Social Security Numbers, Tax IDs (watch for OCR errors: "SOCIAT SEOURITY", "NATIONAL SECRETARY", "SECRETARY OF STATE")
- face: Human faces (NOT "surface" or "interface")
- address: Physical addresses (NOT IP addresses)
- email: Email addresses
- phone: Phone NUMBERS displayed (NOT phone devices)
- id_card: Driver's licenses, government IDs, passports

Think step-by-step:
1. What type of document or scene is described?
2. What specific text is visible? Does it match PII patterns (XXX-XX-XXXX, XXXX-XXXX-XXXX-XXXX)?
3. Are there faces, signatures, or identifying features mentioned?
4. What is your confidence level based on the description detail?

    Respond with ONLY valid JSON (no markdown, no code blocks). Do not use trailing commas.
    Format: {"hasPII":boolean,"confidence":"high"|"medium"|"low","types":["type1","type2"],"count":number}
    
    Rules:
- If description is vague or uncertain, use "low" confidence (triggers cloud fallback)
- Nature photos, landscapes, generic objects without visible PII = {"hasPII":false,"confidence":"high","types":[],"count":0}
- Generic "phone" or "screen" ≠ PII unless NUMBERS are explicitly mentioned
- "Social Security" header + numbers = SSN, regardless of OCR errors`;

    try {
      const analysisResult = await this.textLM.complete({
        messages: [{ role: 'user', content: analysisPrompt }],
      });

      let analysisText = analysisResult.response;

      console.log('[PIIDetector] Full LLM Response:', analysisText);

      // Extract content after </think> if thinking mode is enabled
      const thinkEndIndex = analysisText.lastIndexOf('</think>');
      if (thinkEndIndex !== -1) {
        analysisText = analysisText.substring(thinkEndIndex + 8).trim();
        console.log(
          '[PIIDetector] Extracted post-thinking content:',
          analysisText
        );
      }

      // Remove special tokens
      analysisText = analysisText.replace(/<\|.*?\|>/g, '').trim();

      // Remove markdown code blocks if present
      analysisText = analysisText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      console.log('[PIIDetector] Cleaned analysis:', analysisText);

      // Find the JSON object: look for the last valid JSON object
      // Try multiple approaches to extract clean JSON
      let jsonString = '';

      // Approach 1: Look for JSON after "final answer" or similar markers
      const markers = ['final answer:', 'final:', 'answer:', 'result:'];
      for (const marker of markers) {
        const markerIndex = analysisText.toLowerCase().lastIndexOf(marker);
        if (markerIndex !== -1) {
          const afterMarker = analysisText
            .substring(markerIndex + marker.length)
            .trim();
          const firstOpen = afterMarker.indexOf('{');
          const lastClose = afterMarker.lastIndexOf('}');
          if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            jsonString = afterMarker.substring(firstOpen, lastClose + 1);
            break;
          }
        }
      }

      // Approach 2: Look for the last complete JSON object in the text
      if (!jsonString) {
        const jsonObjects = analysisText.match(/\{[^{}]*"hasPII"[^{}]*\}/g);
        if (jsonObjects && jsonObjects.length > 0) {
          jsonString = jsonObjects[jsonObjects.length - 1]; // Use the last one
        }
      }

      // Approach 3: Fallback to first { to last }
      if (!jsonString) {
        const firstOpen = analysisText.indexOf('{');
        const lastClose = analysisText.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
          jsonString = analysisText.substring(firstOpen, lastClose + 1);
        }
      }

      if (jsonString) {
        console.log('[PIIDetector] Extracted JSON string:', jsonString);
        try {
          // Fix common JSON errors from LLMs
          // 1. Fix unquoted keys (e.g. count:0 -> "count":0)
          jsonString = jsonString.replace(
            /([{,]\s*)([a-zA-Z0-9_]+)\s*:/g,
            '$1"$2":'
          );
          // 2. Fix trailing commas (e.g. "types": [], } -> "types": [] })
          jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
          // 3. Fix quotes around boolean values
          jsonString = jsonString.replace(
            /"hasPII":\s*"([^"]+)"/g,
            '"hasPII": $1'
          );
          // 4. Fix quotes around confidence values
          jsonString = jsonString.replace(
            /"confidence":\s*"([^"]+)"/g,
            '"confidence": "$1"'
          );
          // 5. Clean type values: remove colons and extra spaces (e.g. "credit_card: " -> "credit_card")
          jsonString = jsonString.replace(/"([a-z_]+):\s*"/g, '"$1"');
          // 6. Fix missing quotes before count property (e.g. ,count" -> ,"count")
          jsonString = jsonString.replace(/,\s*count"/g, ',"count"');

          console.log('[PIIDetector] Cleaned JSON string:', jsonString);
          const parsed = JSON.parse(jsonString);
          let types = Array.isArray(parsed.types)
            ? parsed.types
                .filter((t: any) => typeof t === 'string')
                .map((t: string) => t.trim().replace(/:\s*$/, '')) // Remove trailing colons and spaces
                .filter((t: string) => t.length > 0) // Remove empty strings
            : [];

          // Handle case where types might be objects (e.g. [{"type": "ssn"}])
          if (
            Array.isArray(parsed.types) &&
            parsed.types.length > 0 &&
            typeof parsed.types[0] === 'object'
          ) {
            const extractedTypes: string[] = [];
            const knownTypes = [
              'credit_card',
              'ssn',
              'face',
              'address',
              'email',
              'phone',
              'id_card',
            ];

            parsed.types.forEach((item: any) => {
              if (typeof item === 'string') {
                extractedTypes.push(item);
              } else if (typeof item === 'object' && item !== null) {
                // Try to find known types in values
                const values = Object.values(item).flat();
                values.forEach((val) => {
                  if (typeof val === 'string') {
                    const lowerVal = val.toLowerCase();
                    // Check if value matches a known type or contains it
                    const match = knownTypes.find(
                      (t) => lowerVal.includes(t) || t.includes(lowerVal)
                    );
                    if (match) extractedTypes.push(match);
                    else extractedTypes.push(val); // Keep original if no match found
                  }
                });
              }
            });

            if (extractedTypes.length > 0) {
              types = [...new Set(extractedTypes)]; // Deduplicate
            }
          }

          // CRITICAL: Enforce consistency - if hasPII is false, ignore any hallucinated types
          // This fixes LLM bugs like: {"hasPII": false, "types": ["credit_card"], "count": 1}
          const hasPII = parsed.hasPII === true && types.length > 0;
          if (!hasPII) {
            types = []; // Force empty if no PII detected
          }

          console.log('[PIIDetector] Final validated result:', {
            hasPII,
            types,
            count: types.length,
          });

          return {
            hasPII,
            confidence: parsed.confidence || 'medium',
            types,
            count: types.length,
            regions: [],
          };
        } catch (parseError) {
          console.warn(
            '[PIIDetector] JSON parse failed, using fallback',
            parseError
          );
          return this.fallbackDetection(analysisText, description);
        }
      } else {
        return this.fallbackDetection(analysisText, description);
      }
    } catch (error) {
      console.error('[PIIDetector] Error:', error);
      return {
        hasPII: false,
        confidence: 'error',
        types: [],
        count: 0,
        regions: [],
      };
    }
  }

  private fallbackDetection(
    analysisText: string,
    description: string
  ): PIIResult {
    const lowerText = analysisText.toLowerCase();
    const lowerDesc = description.toLowerCase();
    const detectedTypes: string[] = [];

    // If description explicitly says no text/PII, trust it
    if (
      lowerDesc.includes('no visible text') ||
      lowerDesc.includes('do not see any') ||
      lowerDesc.includes('no pii') ||
      lowerDesc.includes('no personal information')
    ) {
      // BUT: If we see strong keywords, override
      const strongKeywords = [
        'social security',
        'credit card',
        'ssn',
        'card number',
        'driver license',
        'passport',
        'national secretary',
        'secretary of state',
      ];
      const hasStrongKeyword = strongKeywords.some((kw) =>
        lowerText.includes(kw)
      );

      if (!hasStrongKeyword) {
        return {
          hasPII: false,
          confidence: 'medium',
          types: [],
          count: 0,
          regions: [],
        };
      }
    }

    const hasNegative = (text: string, term: string) => {
      const idx = text.indexOf(term);
      if (idx === -1) return false;
      const preceding = text.substring(Math.max(0, idx - 30), idx);
      return (
        preceding.includes('no ') ||
        preceding.includes('not ') ||
        preceding.includes('0 ') ||
        preceding.includes('zero ')
      );
    };

    // Pattern matching for SSN (XXX-XX-XXXX or variations)
    const ssnPattern = /\d{3}[-\s]?\d{2}[-\s]?\d{4}/;
    if (ssnPattern.test(description) || ssnPattern.test(analysisText)) {
      detectedTypes.push('ssn');
    }

    // Pattern matching for credit card (16 digits, possibly with spaces/dashes)
    const ccPattern = /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/;
    if (ccPattern.test(description) || ccPattern.test(analysisText)) {
      detectedTypes.push('credit_card');
    }

    // Keyword-based detection (only if NOT negated and patterns not already matched)
    if (
      !detectedTypes.includes('credit_card') &&
      (lowerText.includes('credit card') ||
        lowerText.includes('card number') ||
        lowerText.includes('visa') ||
        lowerText.includes('mastercard')) &&
      !hasNegative(lowerText, 'credit card') &&
      !hasNegative(lowerText, 'card number')
    ) {
      detectedTypes.push('credit_card');
    }

    if (
      !detectedTypes.includes('ssn') &&
      (lowerText.includes('ssn') ||
        lowerText.includes('social security') ||
        lowerText.includes('sociat seourity') ||
        lowerText.includes('national secretary') ||
        lowerText.includes('secretary of state') ||
        lowerText.includes('passport')) &&
      !hasNegative(lowerText, 'ssn') &&
      !hasNegative(lowerText, 'social security') &&
      !hasNegative(lowerText, 'passport')
    ) {
      detectedTypes.push('ssn');
    }

    // Face detection: be careful with "surface" or "interface"
    if (
      lowerText.includes('face') &&
      !hasNegative(lowerText, 'face') &&
      !lowerText.includes('surface') &&
      !lowerText.includes('interface')
    ) {
      // Double check description for nature context
      if (
        !lowerDesc.includes('flower') &&
        !lowerDesc.includes('nature') &&
        !lowerDesc.includes('plant')
      ) {
        detectedTypes.push('face');
      }
    }

    if (
      lowerText.includes('address') &&
      !hasNegative(lowerText, 'address') &&
      !lowerText.includes('ip address')
    )
      detectedTypes.push('address');
    if (lowerText.includes('email') && !hasNegative(lowerText, 'email'))
      detectedTypes.push('email');
    if (
      lowerText.includes('phone') &&
      !hasNegative(lowerText, 'phone') &&
      !lowerText.includes('microphone')
    )
      detectedTypes.push('phone');

    // ID card detection
    if (
      (lowerText.includes('driver') && lowerText.includes('license')) ||
      lowerText.includes('id card') ||
      lowerText.includes('government id')
    ) {
      if (!detectedTypes.includes('ssn')) {
        // Don't double-count if SSN already detected
        detectedTypes.push('id_card');
      }
    }

    return {
      hasPII: detectedTypes.length > 0,
      confidence: 'low',
      types: detectedTypes,
      count: detectedTypes.length,
      regions: [],
    };
  }
}

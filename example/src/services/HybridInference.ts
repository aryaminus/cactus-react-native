import { PIIDetector } from './PIIDetector';
import type { PIIResult } from './PIIDetector';
import { CloudInference } from './CloudInference';

export class HybridInference {
  private localDetector: PIIDetector;
  private cloudInference: CloudInference;

  constructor(textLM: any) {
    this.localDetector = new PIIDetector(textLM);
    this.cloudInference = new CloudInference();
  }

  async setCloudConfig(config: {
    provider: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
  }) {
    if (config.baseUrl) {
      this.cloudInference.setBaseUrl(config.baseUrl);
    }
    await this.cloudInference.configure(
      config.provider,
      config.model,
      config.apiKey
    );
  }

  /**
   * Analyze image description with hybrid strategy
   * @param description Image description from Vision model
   * @param allowCloud Whether user consented to cloud analysis
   */
  async analyze(
    description: string,
    allowCloud: boolean = false
  ): Promise<PIIResult> {
    console.log('🏠 Starting local analysis...', { allowCloud });
    const localResult =
      await this.localDetector.analyzeDescription(description);

    // High confidence local result - no cloud needed
    if (localResult.confidence === 'high') {
      console.log(
        '✅ High confidence local detection:',
        localResult.confidence
      );
      return localResult;
    }

    // Medium or low confidence + cloud allowed - use cloud for better accuracy
    if (
      allowCloud &&
      (localResult.confidence === 'medium' || localResult.confidence === 'low')
    ) {
      console.log('☁️ Medium/low confidence, using cloud for verification...', {
        confidence: localResult.confidence,
        allowCloud,
      });
      try {
        const cloudJson =
          await this.cloudInference.analyzeDescription(description);

        // Convert cloud JSON to PIIResult
        const types = Array.isArray(cloudJson.types) ? cloudJson.types : [];
        const cloudResult = {
          hasPII: cloudJson.hasPII === true,
          confidence: 'high' as const, // Cloud is assumed high confidence
          types: types,
          count: types.length,
          regions: [], // Cloud doesn't give regions on description
        };

        console.log('☁️ Cloud result:', cloudResult);

        // If cloud finds PII but local didn't, trust cloud (better safe than sorry)
        if (cloudResult.hasPII && !localResult.hasPII) {
          console.warn(
            '⚠️ Cloud found PII that local missed!',
            cloudResult.types
          );
          return cloudResult;
        }

        // If local found PII but cloud didn't, trust local (conservative)
        if (localResult.hasPII && !cloudResult.hasPII) {
          console.warn(
            '⚠️ Local found PII but cloud did not, keeping local result'
          );
          return { ...localResult, confidence: 'high' }; // Upgrade confidence
        }

        // Both agree or cloud has more types - use cloud
        return cloudResult;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          'Cloud analysis failed, using local result:',
          errorMessage
        );

        // Show user-friendly message for common cloud errors
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('sleeping') ||
          errorMessage.includes('timeout')
        ) {
          console.warn(
            '☁️ Cloud service unavailable - using local analysis only. Consider checking your internet connection or trying again later.'
          );
        }

        return localResult;
      }
    }

    // Medium/low confidence but no cloud permission - return with warning
    if (
      localResult.confidence === 'medium' ||
      localResult.confidence === 'low'
    ) {
      console.log(
        '⚠️ Uncertain result, cloud not enabled. Consider enabling cloud for better accuracy.',
        {
          confidence: localResult.confidence,
          allowCloud,
          reason: allowCloud
            ? 'Cloud allowed but condition not met'
            : 'Cloud not allowed',
        }
      );
    }

    return localResult;
  }
}

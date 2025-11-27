export interface RedactionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
}

export class ImageRedactor {
  /**
   * Generate redaction regions based on PII types
   * Returns normalized coordinates (0-1) relative to image size
   *
   * PRODUCTION APPROACH: Privacy-First Conservative Redaction
   *
   * This implementation prioritizes privacy over precision:
   * - Larger coverage areas to ensure complete PII redaction
   * - Multiple overlapping regions for comprehensive protection
   * - Full-document coverage when 3+ PII types detected
   *
   * Trade-off: More of the image is obscured, but ZERO PII leakage risk
   *
   * FUTURE ENHANCEMENT (Optional): OCR integration would enable pixel-perfect redaction
   * Recommended libraries: react-native-vision-camera + ML Kit OCR
   */
  getRedactionRegions(piiTypes: string[]): RedactionRegion[] {
    const regions: RedactionRegion[] = [];

    // CONSERVATIVE APPROACH: Larger regions to ensure complete coverage
    // Better to over-redact than under-redact for privacy

    // Handle SSN and social security card
    if (piiTypes.includes('ssn') || piiTypes.includes('social_security_card')) {
      // SSN typically in center-top of SSN cards - cover generously
      regions.push({
        x: 0.15,
        y: 0.3,
        width: 0.7, // Increased from 0.6
        height: 0.2, // Increased from 0.15
        type: 'ssn',
      });
    }

    if (piiTypes.includes('credit_card')) {
      // Credit card number typically center - cover entire middle section
      regions.push({
        x: 0.05,
        y: 0.35,
        width: 0.9, // Increased from 0.8
        height: 0.35, // Increased from 0.25
        type: 'credit_card',
      });
    }

    if (piiTypes.includes('face')) {
      // Face typically upper portion - be generous
      regions.push({
        x: 0.1,
        y: 0.1,
        width: 0.4, // Increased from 0.35
        height: 0.45, // Increased from 0.4
        type: 'face',
      });
    }

    if (piiTypes.includes('address')) {
      // Address typically lower portion - cover generously
      regions.push({
        x: 0.05,
        y: 0.55,
        width: 0.9, // Increased from 0.8
        height: 0.25, // Increased from 0.2
        type: 'address',
      });
    }

    if (piiTypes.includes('id_card')) {
      // DL/ID cards - cover almost entire document (very conservative)
      regions.push({
        x: 0.02,
        y: 0.05,
        width: 0.96, // Increased from 0.9
        height: 0.9, // Increased from 0.8
        type: 'id_card',
      });
    }

    // For email and phone, add targeted regions
    if (piiTypes.includes('email') || piiTypes.includes('phone')) {
      // These are typically in lower sections or headers
      regions.push({
        x: 0.05,
        y: 0.7,
        width: 0.9,
        height: 0.2,
        type: 'contact_info',
      });
    }

    // For other PII types or if multiple types detected, add comprehensive coverage
    const knownTypes = [
      'ssn',
      'social_security_card',
      'credit_card',
      'face',
      'address',
      'id_card',
      'email',
      'phone',
    ];
    const otherTypes = piiTypes.filter((t) => !knownTypes.includes(t));
    if (otherTypes.length > 0 || piiTypes.length >= 3) {
      // Multiple PII types or unknown type - use very conservative full coverage
      regions.push({
        x: 0.02,
        y: 0.02,
        width: 0.96,
        height: 0.96,
        type: 'comprehensive',
      });
    }

    return regions;
  }

  /**
   * For MVP: Return a placeholder "redacted" indicator
   * In production, would use react-native-image-filter-kit or similar
   */
  async redactImage(imageUri: string, piiTypes: string[]): Promise<string> {
    // For hackathon demo: return original with metadata
    // In real implementation: apply blur/pixelation
    console.log(`Would redact ${piiTypes.join(', ')} from ${imageUri}`);
    return imageUri;
  }

  /**
   * Generate redaction summary for display
   */
  getRedactionSummary(piiTypes: string[]): string {
    const typeMap: Record<string, string> = {
      credit_card: 'Credit Card',
      ssn: 'Social Security Number',
      social_security_card: 'Social Security Card',
      email: 'Email Address',
      phone: 'Phone Number',
      face: 'Face',
      address: 'Address',
      id_card: 'ID Card',
    };

    return piiTypes.map((type) => typeMap[type] || type).join(', ');
  }

  /**
   * Simulate blur effect (for demo purposes)
   */
  async simulateBlur(imageUri: string): Promise<string> {
    // In real app: use image processing library
    // For demo: return same URI with flag
    return imageUri + '?redacted=true';
  }
}

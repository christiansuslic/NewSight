export interface AccessibilityProfile {
  contrastMode: 'none' | 'high' | 'grayscale';
  fontSize: number; // 1-6 scale
  simplifyText: boolean;
  colorAdjustments: boolean; // red/green adjustments
  customSupportNote: string;
}

export const defaultProfile: AccessibilityProfile = {
  contrastMode: 'none',
  fontSize: 4, // Changed from 3 to 4 (Large text)
  simplifyText: false,
  colorAdjustments: false,
  customSupportNote: ''
};

export const fontSizes = [
  { size: 1, label: 'Very Small', textClass: 'text-sm', headingClass: 'text-lg' },
  { size: 2, label: 'Small', textClass: 'text-base', headingClass: 'text-xl' },
  { size: 3, label: 'Normal', textClass: 'text-lg', headingClass: 'text-2xl' },
  { size: 4, label: 'Large', textClass: 'text-xl', headingClass: 'text-3xl' },
  { size: 5, label: 'Very Large', textClass: 'text-2xl', headingClass: 'text-4xl' },
  { size: 6, label: 'Extra Large', textClass: 'text-3xl', headingClass: 'text-5xl' }
];
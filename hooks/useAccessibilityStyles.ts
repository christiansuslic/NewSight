import { AccessibilityProfile, fontSizes } from '../types/accessibility';

export function useAccessibilityStyles(profile: AccessibilityProfile) {
  const getContainerClasses = () => {
    let classes = 'min-h-screen transition-all duration-300 ';
    
    if (profile.contrastMode === 'high') {
      classes += 'bg-black text-white ';
    } else {
      classes += 'bg-gray-50 text-gray-900 ';
    }
    
    return classes;
  };

  const getCurrentFontClasses = () => {
    const fontConfig = fontSizes.find(f => f.size === profile.fontSize) || fontSizes[2];
    return fontConfig;
  };

  const getCurrentFontClass = () => {
    return fontSizes.find(f => f.size === profile.fontSize)?.textClass || 'text-lg';
  };

  const getButtonColors = () => {
    if (profile.colorAdjustments) {
      return {
        primary: 'bg-blue-600 hover:bg-blue-700 text-white',
        secondary: 'bg-yellow-500 hover:bg-yellow-600 text-black',
        accent: 'bg-purple-600 hover:bg-purple-700 text-white',
        success: 'bg-blue-500 hover:bg-blue-600 text-white'
      };
    } else {
      return {
        primary: 'bg-blue-600 hover:bg-blue-700 text-white',
        secondary: 'bg-green-600 hover:bg-green-700 text-white',
        accent: 'bg-purple-600 hover:bg-purple-700 text-white',
        success: 'bg-green-600 hover:bg-green-700 text-white'
      };
    }
  };

  const getCardClasses = () => {
    let classes = 'rounded-2xl shadow-lg p-8 mb-8 transition-all duration-200 ';
    
    if (profile.contrastMode === 'high') {
      classes += 'bg-gray-900 border-2 border-white ';
    } else {
      classes += 'bg-white border border-gray-200 ';
    }
    
    return classes;
  };

  return {
    getContainerClasses,
    getCurrentFontClasses,
    getCurrentFontClass,
    getButtonColors,
    getCardClasses,
    fontSizes
  };
}
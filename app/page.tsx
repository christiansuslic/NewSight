'use client';

// Ensure SpeechRecognition is recognized by TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

type SpeechRecognition = any;

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface AccessibilityProfile {
  contrastMode: 'none' | 'high' | 'grayscale';
  fontSize: number; // 1-6 scale
  simplifyText: boolean;
  colorAdjustments: boolean; // red/green adjustments
  customSupportNote: string;
}

// ✅ CORRECT DEFAULT VALUES - EXACTLY AS REQUESTED
const defaultProfile: AccessibilityProfile = {
  contrastMode: 'none', // ✅ High contrast: false (OFF)
  fontSize: 4, // ✅ Text size: 4 (Large)
  simplifyText: false, // ✅ Simplified language: false (OFF) - FIXED!
  colorAdjustments: false, // ✅ Color vision: false (OFF)
  customSupportNote: ''
};

const fontSizes = [
  { size: 1, label: 'Very Small', textClass: 'text-sm' },
  { size: 2, label: 'Small', textClass: 'text-base' },
  { size: 3, label: 'Normal', textClass: 'text-lg' },
  { size: 4, label: 'Large', textClass: 'text-xl' },
  { size: 5, label: 'Very Large', textClass: 'text-2xl' },
  { size: 6, label: 'Extra Large', textClass: 'text-3xl' }
];

export default function ConfigurationPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AccessibilityProfile>(defaultProfile);
  const [currentStep, setCurrentStep] = useState(0);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [ttsAvailable, setTtsAvailable] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const steps = [
    {
      id: 'colorAdjustments',
      question: "Welcome to NewSight! I'm here to help you set up your news experience. Let's start by checking if you have any issues seeing certain colors?",
      type: 'toggle',
      key: 'colorAdjustments'
    },
    {
      id: 'contrast',
      question: "Do you need high contrast mode to see text more clearly?",
      type: 'toggle',
      key: 'contrastMode'
    },
    {
      id: 'fontSize',
      question: "Let's adjust the text size. I'll start with normal size - tell me if you'd like it bigger or smaller.",
      type: 'slider',
      key: 'fontSize'
    },
    {
      id: 'simplify',
      question: "Should I simplify the language to make articles easier to read?",
      type: 'toggle',
      key: 'simplifyText'
    },
    {
      id: 'support',
      question: "Is there anything else I should know to support you better?",
      type: 'text',
      key: 'customSupportNote'
    }
  ];

  useEffect(() => {
    // CRITICAL FIX: Don't load from localStorage on initial load
    // This ensures we always start with the correct defaults
    console.log('=== INITIAL PROFILE SETUP ===');
    console.log('Using default profile:', defaultProfile);
    console.log('High contrast:', defaultProfile.contrastMode);
    console.log('Font size:', defaultProfile.fontSize);
    console.log('Simplified text:', defaultProfile.simplifyText);
    console.log('Color adjustments:', defaultProfile.colorAdjustments);
    console.log('=============================');

    // Initialize speech recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          
          // Provide specific feedback based on error type
          if (event.error === 'no-speech') {
            setFeedbackMessage('No speech detected. Please check your microphone connection and ensure microphone permissions are granted for this browser. Try speaking closer to your microphone.');
          } else if (event.error === 'not-allowed') {
            setFeedbackMessage('Microphone access denied. Please allow microphone permissions in your browser settings and refresh the page.');
          } else if (event.error === 'network') {
            setFeedbackMessage('Network error occurred. Please check your internet connection and try again.');
          } else {
            setFeedbackMessage('Speech recognition error. Please try again or use the manual controls.');
          }
        };

        recognition.onresult = (event: any) => {
          const result = event.results[0][0].transcript;
          processUserResponse(result);
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const speakQuestion = async (questionText: string) => {
    try {
      setIsAISpeaking(true);
      setFeedbackMessage('');
      
      const response = await fetch('/api/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: questionText,
          voiceId: process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || "bIHbv24MWmeRgasZH58o"
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.audioUrl && audioRef.current) {
          audioRef.current.src = data.audioUrl;
          await audioRef.current.play();
          // Audio will automatically start listening when it ends via onEnded event
        } else if (data.fallback) {
          setTtsAvailable(false);
          setIsAISpeaking(false);
          // Start listening immediately if TTS is unavailable
          autoStartListening();
        }
      } else {
        setTtsAvailable(false);
        setIsAISpeaking(false);
        // Start listening immediately if TTS fails
        autoStartListening();
      }
    } catch (error) {
      console.log('TTS unavailable');
      setTtsAvailable(false);
      setIsAISpeaking(false);
      // Start listening immediately if TTS fails
      autoStartListening();
    }
  };

  // Separate function for automatic listening that bypasses the isAISpeaking check
  const autoStartListening = () => {
    if (recognitionRef.current && !isListening && !isProcessing) {
      setFeedbackMessage('Listening for your response...');
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
        setFeedbackMessage('Could not start voice recognition. Please use manual controls or try the microphone button.');
      }
    }
  };

  // Function to apply setting updates based on classification
  const applySettingUpdate = (stepKey: string, classification: string, userResponse: string) => {
    console.log(`=== APPLYING SETTING UPDATE ===`);
    console.log(`Step Key: ${stepKey}`);
    console.log(`Classification: ${classification}`);
    console.log(`User Response: ${userResponse}`);
    console.log(`================================`);
    
    if (stepKey === 'colorAdjustments') {
      const shouldEnable = classification.includes('ENABLE');
      setProfile(prev => {
        const newProfile = { ...prev, colorAdjustments: shouldEnable };
        console.log('Updated colorAdjustments profile:', newProfile);
        return newProfile;
      });
      setFeedbackMessage(shouldEnable ? 'Color adjustments enabled!' : 'Color adjustments disabled.');
    } else if (stepKey === 'contrastMode') {
      const shouldEnable = classification.includes('ENABLE');
      setProfile(prev => {
        const newProfile: AccessibilityProfile = { 
          ...prev, 
          contrastMode: shouldEnable ? 'high' : 'none' 
        };
        console.log('Updated contrastMode profile:', newProfile);
        return newProfile;
      });
      setFeedbackMessage(shouldEnable ? 'High contrast mode enabled!' : 'High contrast mode disabled.');
    } else if (stepKey === 'simplifyText') {
      const shouldEnable = classification.includes('ENABLE');
      setProfile(prev => {
        const newProfile = { ...prev, simplifyText: shouldEnable };
        console.log('Updated simplifyText profile:', newProfile);
        return newProfile;
      });
      setFeedbackMessage(shouldEnable ? 'Text simplification enabled!' : 'Text simplification disabled.');
    } else if (stepKey === 'fontSize') {
      if (classification.includes('BIGGER')) {
        setProfile(prev => {
          const newSize = Math.min(6, prev.fontSize + 2);
          const newProfile = { ...prev, fontSize: newSize };
          console.log('Updated fontSize profile (bigger):', newProfile);
          return newProfile;
        });
        setFeedbackMessage(`Font size increased!`);
      } else if (classification.includes('SMALLER')) {
        setProfile(prev => {
          const newSize = Math.max(1, prev.fontSize - 1);
          const newProfile = { ...prev, fontSize: newSize };
          console.log('Updated fontSize profile (smaller):', newProfile);
          return newProfile;
        });
        setFeedbackMessage(`Font size decreased!`);
      } else {
        setFeedbackMessage('Font size kept at current setting.');
      }
    } else if (stepKey === 'customSupportNote') {
      if (classification.includes('SAVE')) {
        setProfile(prev => {
          const newProfile = { ...prev, customSupportNote: userResponse };
          console.log('Updated customSupportNote profile:', newProfile);
          return newProfile;
        });
        setFeedbackMessage('Your support note has been saved!');
      } else {
        setFeedbackMessage('No additional support needs noted.');
      }
    }
  };

  // CRITICAL FIX: Improved classification logic
  const classifyUserResponse = (userResponse: string, stepKey: string): string => {
    const lowerResponse = userResponse.toLowerCase();
    
    console.log(`=== CLASSIFYING RESPONSE ===`);
    console.log(`User Response: "${userResponse}"`);
    console.log(`Step Key: ${stepKey}`);
    
    let classification = '';
    
    if (stepKey === 'colorAdjustments') {
      // Look for positive indicators for color vision issues
      if (lowerResponse.includes('yes') || 
          lowerResponse.includes('color') || 
          lowerResponse.includes('blind') || 
          lowerResponse.includes('difficult') || 
          lowerResponse.includes('hard') ||
          lowerResponse.includes('trouble') ||
          lowerResponse.includes('problem') ||
          lowerResponse.includes('issue') ||
          lowerResponse.includes('red') ||
          lowerResponse.includes('green')) {
        classification = 'ENABLE';
      } else {
        classification = 'DISABLE';
      }
    } else if (stepKey === 'contrastMode') {
      // Look for positive indicators for high contrast
      if (lowerResponse.includes('yes') || 
          lowerResponse.includes('need') || 
          lowerResponse.includes('help') || 
          lowerResponse.includes('contrast') ||
          lowerResponse.includes('bright') ||
          lowerResponse.includes('dark') ||
          lowerResponse.includes('hard to see') ||
          lowerResponse.includes('difficult')) {
        classification = 'ENABLE';
      } else {
        classification = 'DISABLE';
      }
    } else if (stepKey === 'simplifyText') {
      // Look for positive indicators for text simplification
      if (lowerResponse.includes('yes') || 
          lowerResponse.includes('simpl') || 
          lowerResponse.includes('help') || 
          lowerResponse.includes('easier') ||
          lowerResponse.includes('clear') ||
          lowerResponse.includes('understand') ||
          lowerResponse.includes('read')) {
        classification = 'ENABLE';
      } else {
        classification = 'DISABLE';
      }
    } else if (stepKey === 'fontSize') {
      // Look for size adjustment indicators
      if (lowerResponse.includes('big') || 
          lowerResponse.includes('larg') || 
          lowerResponse.includes('increas') ||
          lowerResponse.includes('more') ||
          lowerResponse.includes('up')) {
        classification = 'BIGGER';
      } else if (lowerResponse.includes('small') || 
                 lowerResponse.includes('decreas') ||
                 lowerResponse.includes('less') ||
                 lowerResponse.includes('down')) {
        classification = 'SMALLER';
      } else {
        classification = 'SAME';
      }
    } else if (stepKey === 'customSupportNote') {
      // Save if there's meaningful content
      if (userResponse.trim().length > 10 && 
          !lowerResponse.includes('no') && 
          !lowerResponse.includes('nothing') &&
          !lowerResponse.includes('not really')) {
        classification = 'SAVE';
      } else {
        classification = 'NONE';
      }
    }
    
    console.log(`Classification Result: ${classification}`);
    console.log(`============================`);
    
    return classification;
  };

  // CRITICAL FIX: Use useRef to capture current step value in callback
  const currentStepRef = useRef(currentStep);
  
  // Update ref whenever currentStep changes
  useEffect(() => {
    currentStepRef.current = currentStep;
    console.log('=== STEP STATE UPDATE ===');
    console.log('Current step updated to:', currentStep);
    console.log('Current step key:', steps[currentStep]?.key);
    console.log('=========================');
  }, [currentStep]);

  const processUserResponse = async (userResponse: string) => {
    try {
      setIsProcessing(true);
      setFeedbackMessage('Processing your response...');

      // CRITICAL FIX: Use the ref value to get the most current step
      const actualCurrentStep = currentStepRef.current;
      const currentStepData = steps[actualCurrentStep];
      
      console.log('=== VOICE RESPONSE DEBUG ===');
      console.log('User said:', userResponse);
      console.log('Actual current step index:', actualCurrentStep);
      console.log('Current step key:', currentStepData.key);
      console.log('Current step question:', currentStepData.question);
      console.log('============================');
      
      // CRITICAL FIX: Use local classification instead of OpenAI for reliability
      const classification = classifyUserResponse(userResponse, currentStepData.key);

      // Apply the setting update immediately using the CURRENT step's key
      applySettingUpdate(currentStepData.key, classification, userResponse);

    } catch (error) {
      console.error('Error processing user response:', error);
      setFeedbackMessage('Could not process your response. Please use the manual controls.');
    } finally {
      setIsProcessing(false);
    }
  };

  const startConfiguration = async () => {
    console.log('Starting configuration - setting currentStep to 0');
    setHasStarted(true);
    setCurrentStep(0); // Explicitly set to step 0
    await speakQuestion(steps[0].question);
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isAISpeaking && !isProcessing) {
      setFeedbackMessage('Listening for your response...');
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
        setFeedbackMessage('Could not start voice recognition. Please check microphone permissions.');
      }
    }
  };

  const nextStep = async () => {
    if (currentStep < steps.length - 1) {
      const nextIndex = currentStep + 1;
      console.log('=== STEP PROGRESSION ===');
      console.log('Moving from step:', currentStep, 'to step:', nextIndex);
      console.log('Next step key:', steps[nextIndex].key);
      console.log('Next step question:', steps[nextIndex].question);
      console.log('========================');
      
      // CRITICAL: Update step state FIRST, then speak
      setCurrentStep(nextIndex);
      setFeedbackMessage(''); // Clear previous feedback when moving to next step
      
      // Small delay to ensure state update is processed
      setTimeout(async () => {
        await speakQuestion(steps[nextIndex].question);
      }, 100);
    } else {
      completeSetup();
    }
  };

  const completeSetup = async () => {
    setIsCompleted(true);
    await speakQuestion("Thanks! I'm customizing your AccessWeb experience now...");
    
    // Save profile
    localStorage.setItem('accessibilityProfile', JSON.stringify(profile));
    
    setTimeout(() => {
      router.push('/news');
    }, 3000);
  };

  const handleToggle = (key: string, value: any) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  };

  const handleSliderChange = (value: number) => {
    setProfile(prev => ({ ...prev, fontSize: value }));
  };

  const handleTextChange = (value: string) => {
    setProfile(prev => ({ ...prev, customSupportNote: value }));
  };

  const stopAI = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsAISpeaking(false);
  };

  // Get current step feedback message based on current setting
  const getCurrentStepFeedback = () => {
    if (feedbackMessage) return feedbackMessage;
    
    const currentStepData = steps[currentStep];
    
    switch (currentStepData.key) {
      case 'colorAdjustments':
        return profile.colorAdjustments ? 'Color adjustments are enabled' : 'Color adjustments are disabled';
      case 'contrastMode':
        return profile.contrastMode === 'high' ? 'High contrast mode is enabled' : 'High contrast mode is disabled';
      case 'fontSize':
        return `Font size is set to ${fontSizes.find(f => f.size === profile.fontSize)?.label}`;
      case 'simplifyText':
        return profile.simplifyText ? 'Text simplification is enabled' : 'Text simplification is disabled';
      case 'customSupportNote':
        return profile.customSupportNote ? 'Custom support note saved' : 'No custom support note';
      default:
        return '';
    }
  };

  // Apply current settings to UI
  const getContainerClasses = () => {
    let classes = 'min-h-screen transition-all duration-300 ';
    
    if (profile.contrastMode === 'high') {
      classes += 'bg-black text-white ';
    } else {
      classes += 'bg-gray-50 text-gray-900 ';
    }
    
    return classes;
  };

  const getCurrentFontClass = () => {
    return fontSizes.find(f => f.size === profile.fontSize)?.textClass || 'text-lg';
  };

  const getButtonColors = () => {
    if (profile.colorAdjustments) {
      return {
        primary: 'bg-blue-600 hover:bg-blue-700 text-white',
        secondary: 'bg-yellow-500 hover:bg-yellow-600 text-black',
        accent: 'bg-purple-600 hover:bg-purple-700 text-white'
      };
    } else {
      return {
        primary: 'bg-blue-600 hover:bg-blue-700 text-white',
        secondary: 'bg-green-600 hover:bg-green-700 text-white',
        accent: 'bg-purple-600 hover:bg-purple-700 text-white'
      };
    }
  };

  if (!hasStarted) {
    return (
      <main className={getContainerClasses() + 'flex items-center justify-center p-4 relative'}>
        {/* Badge Container - Top Right */}
        <div className="fixed top-4 right-4 z-50 flex items-center space-x-3">
          {/* ElevenLabs Badge */}
          <a
            href="https://elevenlabs.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity duration-300 hover:opacity-80"
            aria-label="Powered by ElevenLabs"
          >
            <img
              src={profile.contrastMode === 'high' ? '/logo-white.svg' : '/logo-black.svg'}
              alt="Powered by ElevenLabs"
              className="w-12 h-12 md:w-16 md:h-16"
            />
          </a>
          
          {/* Bolt.new Badge */}
          <a
            href="https://bolt.new/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity duration-300 hover:opacity-80"
            aria-label="Powered by Bolt.new"
          >
            <img
              src={profile.contrastMode === 'high' ? '/white_circle_360x360.png' : '/black_circle_360x360.png'}
              alt="Powered by Bolt.new"
              className="w-12 h-12 md:w-16 md:h-16"
            />
          </a>
        </div>

        <div className="text-center max-w-2xl">
          <div className="mb-6">
            <div className="w-32 h-32 mx-auto mb-6 relative">
              <div className="absolute inset-0 border-6 border-blue-200 rounded-full"></div>
              <div className="absolute inset-3 bg-blue-600 rounded-full flex items-center justify-center">
                <div className="text-white text-2xl">🤖</div>
              </div>
            </div>
          </div>
          
          <h1 className={`font-bold mb-4 ${profile.fontSize >= 5 ? 'text-4xl' : profile.fontSize >= 4 ? 'text-3xl' : 'text-2xl'}`}>
            Welcome to NewSight<br/>Voice-first news for people who read differently.
          </h1>
          
          <p className={`mb-6 leading-relaxed ${getCurrentFontClass()}`}>
            I’ll help you set up the perfect accessibility experience - tailored for how you see, hear, and understand the world.
          </p>
          
          {/* Main Bolt.new Logo - Bigger and more prominent */}
          <div className="mb-8">
            <a
              href="https://bolt.new/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block transition-all duration-300 hover:scale-105 hover:opacity-80"
              aria-label="Powered by Bolt.new"
            >
              <img
                src={profile.contrastMode === 'high' ? '/white_circle_360x360.png' : '/black_circle_360x360.png'}
                alt="Powered by Bolt.new"
                className="w-24 h-24 md:w-32 md:h-32 mx-auto"
              />
            </a>
            <p className={`mt-3 text-sm opacity-75 ${getCurrentFontClass()}`}>
              Built with ❤️ and powered by Bolt.new
            </p>
          </div>
          
          <button
            onClick={startConfiguration}
            className={`px-8 py-4 rounded-2xl font-bold transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 shadow-xl ${getCurrentFontClass()} ${getButtonColors().primary} focus:ring-blue-500`}
          >
            Start AI Setup
          </button>
        </div>
      </main>
    );
  }

  if (isCompleted) {
    return (
      <main className={getContainerClasses() + 'flex items-center justify-center p-4 relative'}>
        {/* Badge Container - Top Right */}
        <div className="fixed top-4 right-4 z-50 flex items-center space-x-3">
          {/* ElevenLabs Badge */}
          <a
            href="https://elevenlabs.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity duration-300 hover:opacity-80"
            aria-label="Powered by ElevenLabs"
          >
            <img
              src={profile.contrastMode === 'high' ? '/logo-white.svg' : '/logo-black.svg'}
              alt="Powered by ElevenLabs"
              className="w-12 h-12 md:w-16 md:h-16"
            />
          </a>
          
          {/* Bolt.new Badge */}
          <a
            href="https://bolt.new/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity duration-300 hover:opacity-80"
            aria-label="Powered by Bolt.new"
          >
            <img
              src={profile.contrastMode === 'high' ? '/white_circle_360x360.png' : '/black_circle_360x360.png'}
              alt="Powered by Bolt.new"
              className="w-12 h-12 md:w-16 md:h-16"
            />
          </a>
        </div>

        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-6">
            <div className="w-full h-full border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className={`font-bold mb-4 ${getCurrentFontClass()}`}>
            Thanks! I&apos;m customizing your AccessWeb experience now...
          </h2>
        </div>
      </main>
    );
  }

  const currentStepData = steps[currentStep];
  const colors = getButtonColors();

  return (
    <main className={getContainerClasses() + 'flex items-center justify-center p-4 relative'}>
      {/* Badge Container - Top Right */}
      <div className="fixed top-4 right-4 z-50 flex items-center space-x-3">
        {/* ElevenLabs Badge */}
        <a
          href="https://elevenlabs.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity duration-300 hover:opacity-80"
          aria-label="Powered by ElevenLabs"
        >
          <img
            src={profile.contrastMode === 'high' ? '/logo-white.svg' : '/logo-black.svg'}
            alt="Powered by ElevenLabs"
            className="w-12 h-12 md:w-16 md:h-16"
          />
        </a>
        
        {/* Bolt.new Badge */}
        <a
          href="https://bolt.new/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity duration-300 hover:opacity-80"
          aria-label="Powered by Bolt.new"
        >
          <img
            src={profile.contrastMode === 'high' ? '/white_circle_360x360.png' : '/black_circle_360x360.png'}
            alt="Powered by Bolt.new"
            className="w-12 h-12 md:w-16 md:h-16"
          />
        </a>
      </div>

      <audio 
        ref={audioRef} 
        onEnded={() => {
          console.log('Audio ended, starting automatic listening...');
          setIsAISpeaking(false);
          // Automatically start listening after AI finishes speaking
          setTimeout(() => {
            autoStartListening();
          }, 800); // Slightly longer delay to ensure state is properly updated
        }}
        onError={() => {
          console.log('Audio error occurred');
          setIsAISpeaking(false);
        }}
      />
      
      <div className="w-full max-w-3xl text-center">
        {/* Animated Ring Visualizer - More compact */}
        <div className="mb-6">
          <div className="w-40 h-40 mx-auto relative">
            {/* Outer ring */}
            <div className={`absolute inset-0 border-4 rounded-full transition-all duration-300 ${
              isAISpeaking 
                ? 'border-blue-400 animate-pulse' 
                : isListening
                  ? 'border-green-400 animate-pulse'
                  : isProcessing
                    ? 'border-orange-400 animate-pulse'
                    : profile.contrastMode === 'high' 
                      ? 'border-white' 
                      : 'border-blue-200'
            }`}></div>
            
            {/* Animated ring when active */}
            {(isAISpeaking || isListening || isProcessing) && (
              <>
                <div className={`absolute inset-0 border-4 rounded-full animate-spin ${
                  isAISpeaking ? 'border-blue-600 border-t-transparent' :
                  isListening ? 'border-green-600 border-t-transparent' :
                  'border-orange-600 border-t-transparent'
                }`}></div>
                <div className={`absolute inset-2 border-2 rounded-full animate-spin ${
                  isAISpeaking ? 'border-green-400 border-b-transparent' :
                  isListening ? 'border-blue-400 border-b-transparent' :
                  'border-blue-400 border-b-transparent'
                }`} 
                     style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
              </>
            )}
            
            {/* Center content */}
            <div className={`absolute inset-6 rounded-full flex items-center justify-center ${
              profile.contrastMode === 'high' ? 'bg-white text-black' : 'bg-blue-600 text-white'
            }`}>
              <div className="text-2xl">
                {isProcessing ? '🤖' : isListening ? '🎤' : isAISpeaking ? '🗣️' : '🤖'}
              </div>
            </div>
          </div>
          
          {/* Stop button when AI is speaking */}
          {isAISpeaking && (
            <button
              onClick={stopAI}
              className={`mt-2 px-4 py-2 rounded-lg font-bold transition-all duration-200 ${colors.secondary} focus:outline-none focus:ring-4 focus:ring-offset-2`}
            >
              Stop Speaking
            </button>
          )}
        </div>

        {/* Progress indicator - More compact */}
        <div className="mb-4">
          <div className="flex justify-center space-x-1 mb-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index <= currentStep 
                    ? profile.colorAdjustments ? 'bg-blue-600' : 'bg-blue-600'
                    : profile.contrastMode === 'high' ? 'bg-gray-600' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
          <p className={`text-sm ${getCurrentFontClass()}`}>
            Step {currentStep + 1} of {steps.length}
          </p>
        </div>

        {/* Question - More compact */}
        <div className="mb-6">
          <h2 className={`font-bold mb-4 leading-relaxed ${profile.fontSize >= 5 ? 'text-2xl' : profile.fontSize >= 4 ? 'text-xl' : 'text-lg'}`}>
            {currentStepData.question}
          </h2>

          {/* Voice interaction - More compact */}
          <div className="mb-4">
            <button
              onClick={startListening}
              disabled={isAISpeaking || isProcessing || isListening}
              className={`px-6 py-3 rounded-full font-bold transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 ${getCurrentFontClass()} ${
                isListening
                  ? 'bg-green-600 text-white animate-pulse focus:ring-green-500'
                  : isProcessing
                    ? 'bg-orange-600 text-white animate-pulse focus:ring-orange-500'
                    : isAISpeaking
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                      : colors.accent + ' focus:ring-purple-500'
              }`}
            >
              {isListening ? '🎤 Listening...' : 
               isProcessing ? '🤖 Processing...' : 
               isAISpeaking ? '⏸️ AI Speaking' : 
               '🎤 Speak Your Answer'}
            </button>
          </div>

          {/* Current step feedback - More compact */}
          <div className="mb-4">
            <p className={`font-semibold ${getCurrentFontClass()}`}>
              {getCurrentStepFeedback()}
            </p>
          </div>

          {/* Manual Controls - More compact */}
          <div className="max-w-xl mx-auto">
            <p className={`mb-3 ${getCurrentFontClass()}`}>Or use manual controls:</p>
            
            {currentStepData.type === 'toggle' && (
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    if (currentStepData.key === 'contrastMode') {
                      const newValue = profile.contrastMode === 'high' ? 'none' : 'high';
                      handleToggle('contrastMode', newValue);
                      setFeedbackMessage(newValue === 'high' ? 'High contrast mode enabled!' : 'High contrast mode disabled.');
                    } else {
                      const newValue = !profile[currentStepData.key as keyof AccessibilityProfile];
                      handleToggle(currentStepData.key, newValue);
                      if (currentStepData.key === 'colorAdjustments') {
                        setFeedbackMessage(newValue ? 'Color adjustments enabled!' : 'Color adjustments disabled.');
                      } else if (currentStepData.key === 'simplifyText') {
                        setFeedbackMessage(newValue ? 'Text simplification enabled!' : 'Text simplification disabled.');
                      }
                    }
                  }}
                  className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                    (currentStepData.key === 'contrastMode' ? profile.contrastMode === 'high' : profile[currentStepData.key as keyof AccessibilityProfile])
                      ? profile.colorAdjustments ? 'bg-blue-600 focus:ring-blue-500' : 'bg-green-600 focus:ring-green-500'
                      : 'bg-gray-400 focus:ring-gray-500'
                  }`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                    (currentStepData.key === 'contrastMode' ? profile.contrastMode === 'high' : profile[currentStepData.key as keyof AccessibilityProfile]) ? 'translate-x-12' : 'translate-x-2'
                  }`} />
                  <span className={`absolute left-2 font-bold text-xs ${
                    (currentStepData.key === 'contrastMode' ? profile.contrastMode === 'high' : profile[currentStepData.key as keyof AccessibilityProfile]) ? 'text-white' : 'text-gray-700'
                  }`}>
                    {(currentStepData.key === 'contrastMode' ? profile.contrastMode === 'high' : profile[currentStepData.key as keyof AccessibilityProfile]) ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            )}

            {currentStepData.type === 'slider' && (
              <div className="space-y-4">
                <div className="text-center">
                  <p className={`font-bold mb-2 ${getCurrentFontClass()}`}>
                    Current size: {fontSizes.find(f => f.size === profile.fontSize)?.label}
                  </p>
                  <div className={`p-3 border-2 rounded-lg ${
                    profile.contrastMode === 'high' ? 'border-white' : 'border-gray-300'
                  }`}>
                    <p className={getCurrentFontClass()}>
                      Sample text at current size
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <span className="text-sm">A</span>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    value={profile.fontSize}
                    onChange={(e) => {
                      const newSize = parseInt(e.target.value);
                      handleSliderChange(newSize);
                      setFeedbackMessage(`Font size set to ${fontSizes.find(f => f.size === newSize)?.label}!`);
                    }}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xl">A</span>
                </div>
              </div>
            )}

            {currentStepData.type === 'text' && (
              <div className="space-y-3">
                <textarea
                  value={profile.customSupportNote}
                  onChange={(e) => {
                    handleTextChange(e.target.value);
                    if (e.target.value.trim().length > 0) {
                      setFeedbackMessage('Your support note has been saved!');
                    }
                  }}
                  placeholder="Tell me anything that would help me assist you better..."
                  className={`w-full p-3 border-2 rounded-lg focus:outline-none focus:ring-4 focus:ring-offset-2 resize-none ${getCurrentFontClass()} ${
                    profile.contrastMode === 'high' 
                      ? 'bg-black text-white border-white focus:ring-white' 
                      : 'bg-white text-gray-900 border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  rows={2}
                />
              </div>
            )}
          </div>
        </div>

        {/* Navigation - Enhanced Continue button */}
        <div className="flex justify-center space-x-3">
          {/* ENHANCED: Bigger, more prominent Continue button */}
          <button
            onClick={nextStep}
            disabled={isAISpeaking || isProcessing}
            className={`px-10 py-4 rounded-xl font-bold text-lg transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 shadow-lg ${colors.primary} focus:ring-blue-500 ${
              (isAISpeaking || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {currentStep === steps.length - 1 ? '✅ Complete Setup' : '➡️ Continue'}
          </button>
          
          <button
            onClick={() => {
              // CRITICAL FIX: Save the current profile before navigating
              localStorage.setItem('accessibilityProfile', JSON.stringify(profile));
              router.push('/news');
            }}
            disabled={isAISpeaking || isProcessing}
            className={`px-4 py-4 rounded-xl font-bold transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-offset-2 ${getCurrentFontClass()} ${
              profile.contrastMode === 'high' 
                ? 'bg-gray-700 hover:bg-gray-600 text-white focus:ring-gray-500' 
                : 'bg-gray-500 hover:bg-gray-600 text-white focus:ring-gray-500'
            } ${(isAISpeaking || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Skip to News
          </button>
        </div>
      </div>
    </main>
  );
}
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccessibilityStyles } from '../../hooks/useAccessibilityStyles';
import { AccessibilityProfile, defaultProfile } from '../../types/accessibility';

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  fullContent: string;
}

interface ProcessedArticle extends NewsArticle {
  displayTitle: string;
  displayDescription: string;
  displayContent: string;
}

export default function NewsPage() {
  const [profile, setProfile] = useState<AccessibilityProfile>(defaultProfile);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [processedArticles, setProcessedArticles] = useState<ProcessedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [showAccessibilityPanel, setShowAccessibilityPanel] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [ttsAvailable, setTtsAvailable] = useState(true);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const {
    getContainerClasses,
    getCurrentFontClass,
    getButtonColors,
    getCardClasses
  } = useAccessibilityStyles(profile);

  // Load accessibility profile from localStorage
  useEffect(() => {
    const savedProfile = localStorage.getItem('accessibilityProfile');
    if (savedProfile) {
      try {
        const parsedProfile = JSON.parse(savedProfile);
        setProfile(parsedProfile);
      } catch (error) {
        console.error('Error parsing saved profile:', error);
      }
    }
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          setFeedbackMessage('Speech recognition error. Please try again.');
        };

        recognition.onresult = (event) => {
          const result = event.results[0][0].transcript;
          processVoiceCommand(result);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // Fetch news articles
  useEffect(() => {
    fetchNews();
  }, []);

  // Process articles when profile.simplifyText changes
  useEffect(() => {
    if (articles.length > 0) {
      processArticlesForDisplay();
    }
  }, [articles, profile.simplifyText]);

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/news');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch news');
      }
      
      const data = await response.json();
      setArticles(data.articles || []);
      
    } catch (error) {
      console.error('Error fetching news:', error);
      setError(error instanceof Error ? error.message : 'Failed to load news');
    } finally {
      setLoading(false);
    }
  };

  const processArticlesForDisplay = async () => {
    if (!articles.length) return;

    if (profile.simplifyText) {
      // Process articles for simplified display
      const processed = await Promise.all(
        articles.map(async (article) => {
          try {
            // Simplify title
            const titleResponse = await fetch('/api/simplify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: article.title })
            });

            // Simplify description
            const descResponse = await fetch('/api/simplify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: article.description })
            });

            // Simplify content
            const contentResponse = await fetch('/api/simplify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: article.fullContent })
            });

            const titleData = titleResponse.ok ? await titleResponse.json() : null;
            const descData = descResponse.ok ? await descResponse.json() : null;
            const contentData = contentResponse.ok ? await contentResponse.json() : null;

            return {
              ...article,
              displayTitle: titleData?.simplified || article.title,
              displayDescription: descData?.simplified || article.description,
              displayContent: contentData?.simplified || article.fullContent
            };
          } catch (error) {
            console.error('Error simplifying article:', error);
            // Fallback to original content if simplification fails
            return {
              ...article,
              displayTitle: article.title,
              displayDescription: article.description,
              displayContent: article.fullContent
            };
          }
        })
      );
      setProcessedArticles(processed);
    } else {
      // Use original content
      const processed = articles.map(article => ({
        ...article,
        displayTitle: article.title,
        displayDescription: article.description,
        displayContent: article.fullContent
      }));
      setProcessedArticles(processed);
    }
  };

  const processVoiceCommand = async (command: string) => {
    try {
      setIsProcessing(true);
      setFeedbackMessage('Processing your command...');

      // Prepare the message with context
      let contextMessage = command;
      
      // Add simplified language context if enabled
      if (profile.simplifyText) {
        contextMessage = `IMPORTANT: User has simplified language mode enabled. Please use simple words and short sentences in your response.

Available news stories:
${processedArticles.map((article, index) => 
  `${index + 1}. ${article.displayTitle} - ${article.displayDescription}`
).join('\n')}

User said: ${command}`;
      } else {
        contextMessage = `Available news articles:
${processedArticles.map((article, index) => 
  `${index + 1}. ${article.displayTitle} - ${article.displayDescription}`
).join('\n')}

User said: ${command}`;
      }

      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: contextMessage,
          conversationId: 'news-session'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to process command');
      }

      const data = await response.json();
      
      // Handle the response
      if (data.action) {
        await handleAgentAction(data.action, data.response);
      }

      // Play audio response if available
      if (data.audioUrl && ttsAvailable) {
        await playAudioResponse(data.audioUrl);
      } else if (!data.ttsAvailable) {
        setTtsAvailable(false);
      }

      setFeedbackMessage(data.response);

    } catch (error) {
      console.error('Error processing voice command:', error);
      setFeedbackMessage('Sorry, I could not process your command. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAgentAction = async (action: any, response: string) => {
    switch (action.type) {
      case 'GET_NEWS':
        // News is already loaded, just provide feedback
        setFeedbackMessage(response);
        break;

      case 'READ_ARTICLE':
        if (action.data?.articleIdentifier) {
          await readArticle(action.data.articleIdentifier, action.data?.fullContent || false);
        }
        break;

      case 'ZOOM_IN':
        setProfile(prev => ({
          ...prev,
          fontSize: Math.min(6, prev.fontSize + 1)
        }));
        break;

      case 'ZOOM_OUT':
        setProfile(prev => ({
          ...prev,
          fontSize: Math.max(1, prev.fontSize - 1)
        }));
        break;

      case 'HIGH_CONTRAST':
        setProfile(prev => ({
          ...prev,
          contrastMode: 'high'
        }));
        break;

      case 'NORMAL_CONTRAST':
        setProfile(prev => ({
          ...prev,
          contrastMode: 'none'
        }));
        break;

      case 'SIMPLIFY_TEXT':
        setProfile(prev => ({
          ...prev,
          simplifyText: !prev.simplifyText
        }));
        break;

      case 'STOP_AUDIO':
        stopCurrentAudio();
        break;

      default:
        console.log('Unknown action type:', action.type);
    }

    // Save updated profile
    localStorage.setItem('accessibilityProfile', JSON.stringify(profile));
  };

  const readArticle = async (identifier: string, fullContent: boolean = false) => {
    try {
      // Find the article by number or keyword
      let articleIndex = -1;
      
      // Try to parse as number first
      const articleNumber = parseInt(identifier);
      if (!isNaN(articleNumber) && articleNumber >= 1 && articleNumber <= processedArticles.length) {
        articleIndex = articleNumber - 1;
      } else {
        // Search by keyword in title
        articleIndex = processedArticles.findIndex(article => 
          article.displayTitle.toLowerCase().includes(identifier.toLowerCase())
        );
      }

      if (articleIndex === -1) {
        setFeedbackMessage(`Sorry, I couldn't find article "${identifier}". Please try a different number or keyword.`);
        return;
      }

      const article = processedArticles[articleIndex];
      let textToRead = '';

      if (fullContent) {
        textToRead = `${article.displayTitle}. ${article.displayContent}`;
      } else {
        textToRead = `${article.displayTitle}. ${article.displayDescription}`;
      }

      // Generate and play audio
      if (ttsAvailable) {
        try {
          const ttsResponse = await fetch('/api/elevenlabs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: textToRead,
              voiceId: process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || "bIHbv24MWmeRgasZH58o"
            })
          });

          if (ttsResponse.ok) {
            const ttsData = await ttsResponse.json();
            if (ttsData.audioUrl) {
              await playAudioResponse(ttsData.audioUrl);
              setFeedbackMessage(`Reading ${fullContent ? 'full article' : 'article'}: ${article.displayTitle}`);
            }
          }
        } catch (error) {
          console.error('Error generating audio:', error);
          setFeedbackMessage(`Found article: ${article.displayTitle}. ${textToRead}`);
        }
      } else {
        setFeedbackMessage(`Found article: ${article.displayTitle}. ${textToRead}`);
      }

    } catch (error) {
      console.error('Error reading article:', error);
      setFeedbackMessage('Sorry, I encountered an error while trying to read the article.');
    }
  };

  const playAudioResponse = async (audioUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Stop any currently playing audio
      stopCurrentAudio();

      const audio = new Audio(audioUrl);
      setCurrentAudio(audio);
      setIsAISpeaking(true);

      audio.onended = () => {
        setIsAISpeaking(false);
        setCurrentAudio(null);
        resolve();
      };

      audio.onerror = (error) => {
        setIsAISpeaking(false);
        setCurrentAudio(null);
        reject(error);
      };

      audio.play().catch(reject);
    });
  };

  const stopCurrentAudio = () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
    setIsAISpeaking(false);
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isAISpeaking && !isProcessing) {
      setFeedbackMessage('Listening for your command...');
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
        setFeedbackMessage('Could not start voice recognition. Please check microphone permissions.');
      }
    }
  };

  const updateProfile = (updates: Partial<AccessibilityProfile>) => {
    const newProfile = { ...profile, ...updates };
    setProfile(newProfile);
    localStorage.setItem('accessibilityProfile', JSON.stringify(newProfile));
    
    // Provide immediate feedback for simplified language toggle
    if ('simplifyText' in updates) {
      setFeedbackMessage(updates.simplifyText ? 'Simplified language enabled - articles will use easier words' : 'Simplified language disabled - articles will use normal language');
    }
  };

  const colors = getButtonColors();

  if (loading) {
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
          <div className="w-16 h-16 mx-auto mb-4">
            <div className="w-full h-full border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className={`font-bold ${getCurrentFontClass()}`}>Loading news...</h2>
        </div>
      </main>
    );
  }

  if (error) {
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

        <div className="text-center max-w-md">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className={`font-bold mb-4 ${getCurrentFontClass()}`}>Error Loading News</h2>
          <p className={`mb-6 ${getCurrentFontClass()}`}>{error}</p>
          <button
            onClick={fetchNews}
            className={`px-6 py-3 rounded-lg font-bold transition-all duration-200 ${colors.primary} ${getCurrentFontClass()}`}
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={getContainerClasses() + 'p-4 relative'}>
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

      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className={`font-bold ${profile.fontSize >= 5 ? 'text-4xl' : profile.fontSize >= 4 ? 'text-3xl' : 'text-2xl'}`}>
            Welcome to NewSight
          </h1>
          
          <button
            onClick={() => setShowAccessibilityPanel(!showAccessibilityPanel)}
            className={`px-4 py-2 rounded-lg font-bold transition-all duration-200 ${colors.secondary} ${getCurrentFontClass()}`}
          >
            ⚙️ Accessibility
          </button>
        </div>

        {/* Voice Interface */}
        <div className={getCardClasses() + 'text-center mb-8'}>
          {/* AI Status Indicator */}
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto relative">
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
              
              {(isAISpeaking || isListening || isProcessing) && (
                <div className={`absolute inset-0 border-4 rounded-full animate-spin ${
                  isAISpeaking ? 'border-blue-600 border-t-transparent' :
                  isListening ? 'border-green-600 border-t-transparent' :
                  'border-orange-600 border-t-transparent'
                }`}></div>
              )}
              
              <div className={`absolute inset-3 rounded-full flex items-center justify-center ${
                profile.contrastMode === 'high' ? 'bg-white text-black' : 'bg-blue-600 text-white'
              }`}>
                <div className="text-xl">
                  {isProcessing ? '🤖' : isListening ? '🎤' : isAISpeaking ? '🗣️' : '🤖'}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={startListening}
            disabled={isAISpeaking || isProcessing || isListening}
            className={`px-8 py-4 rounded-full font-bold transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 mb-4 ${getCurrentFontClass()} ${
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
             '🎤 Voice Command'}
          </button>

          {isAISpeaking && (
            <button
              onClick={stopCurrentAudio}
              className={`ml-4 px-4 py-2 rounded-lg font-bold transition-all duration-200 ${colors.secondary} focus:outline-none focus:ring-4 focus:ring-offset-2`}
            >
              Stop Speaking
            </button>
          )}

          <div className="mt-4">
            <p className={`font-semibold mb-2 ${getCurrentFontClass()}`}>Try saying:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div className={`p-4 rounded-lg ${profile.contrastMode === 'high' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <div className="text-2xl mb-2">📰</div>
                <div className={`font-bold mb-1 ${getCurrentFontClass()}`}>News Summary</div>
                <div className={`text-sm ${getCurrentFontClass()}`}>
                  "What's new today?"<br/>
                  "Tell me the news"<br/>
                  "What's happening?"
                </div>
              </div>
              
              <div className={`p-4 rounded-lg ${profile.contrastMode === 'high' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <div className="text-2xl mb-2">🔢</div>
                <div className={`font-bold mb-1 ${getCurrentFontClass()}`}>Read by Number</div>
                <div className={`text-sm ${getCurrentFontClass()}`}>
                  "Read article 1"<br/>
                  "Read the first article"<br/>
                  "Read article number 2"
                </div>
              </div>
              
              <div className={`p-4 rounded-lg ${profile.contrastMode === 'high' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <div className="text-2xl mb-2">🔍</div>
                <div className={`font-bold mb-1 ${getCurrentFontClass()}`}>Read by Topic</div>
                <div className={`text-sm ${getCurrentFontClass()}`}>
                  "Read the sports article"<br/>
                  "Tell me about politics"<br/>
                  "Article about technology"
                </div>
              </div>
            </div>
          </div>

          <p className={`mt-4 text-sm ${getCurrentFontClass()}`}>
            You can also say: "Make text bigger" • "High contrast" • "Use simple language"
          </p>

          {feedbackMessage && (
            <div className={`mt-4 p-3 rounded-lg ${profile.contrastMode === 'high' ? 'bg-gray-800' : 'bg-blue-50'}`}>
              <p className={`font-semibold ${getCurrentFontClass()}`}>{feedbackMessage}</p>
            </div>
          )}
        </div>

        {/* News Articles */}
        <div className="space-y-6">
          {processedArticles.map((article, index) => (
            <article key={index} className={getCardClasses()}>
              <div className="flex items-start space-x-4">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${colors.primary}`}>
                  {index + 1}
                </div>
                <div className="flex-1">
                  <h2 className={`font-bold mb-3 leading-tight ${profile.fontSize >= 5 ? 'text-2xl' : profile.fontSize >= 4 ? 'text-xl' : 'text-lg'}`}>
                    {article.displayTitle}
                  </h2>
                  <p className={`mb-4 leading-relaxed ${getCurrentFontClass()}`}>
                    {article.displayDescription}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => readArticle((index + 1).toString(), false)}
                      disabled={isAISpeaking || isProcessing}
                      className={`px-4 py-2 rounded-lg font-bold transition-all duration-200 ${colors.primary} ${getCurrentFontClass()} ${
                        (isAISpeaking || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      🔊 Read Article
                    </button>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`px-4 py-2 rounded-lg font-bold transition-all duration-200 ${colors.accent} ${getCurrentFontClass()}`}
                    >
                      🔗 Read on {article.source}
                    </a>
                    <span className={`text-sm ${getCurrentFontClass()}`}>
                      {new Date(article.publishedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Accessibility Panel */}
      {showAccessibilityPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40">
          <div className={`max-w-md w-full rounded-2xl p-6 ${profile.contrastMode === 'high' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`font-bold ${getCurrentFontClass()}`}>Accessibility Preferences</h3>
              <button
                onClick={() => setShowAccessibilityPanel(false)}
                className={`text-2xl hover:opacity-70 transition-opacity ${getCurrentFontClass()}`}
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* High Contrast */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className={`font-bold ${getCurrentFontClass()}`}>High Contrast Mode: {profile.contrastMode === 'high' ? 'ON' : 'OFF'}</label>
                </div>
                <button
                  onClick={() => updateProfile({ 
                    contrastMode: profile.contrastMode === 'high' ? 'none' : 'high' 
                  })}
                  className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                    profile.contrastMode === 'high'
                      ? 'bg-blue-600 focus:ring-blue-500'
                      : 'bg-gray-400 focus:ring-gray-500'
                  }`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                    profile.contrastMode === 'high' ? 'translate-x-12' : 'translate-x-2'
                  }`} />
                </button>
                <p className={`text-sm mt-1 ${getCurrentFontClass()}`}>
                  {profile.contrastMode === 'high' ? 'White text on black background for better visibility' : 'Standard color scheme'}
                </p>
              </div>

              {/* Color Vision Adjustments */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className={`font-bold ${getCurrentFontClass()}`}>Color Vision Adjustments: {profile.colorAdjustments ? 'ON' : 'OFF'}</label>
                </div>
                <button
                  onClick={() => updateProfile({ colorAdjustments: !profile.colorAdjustments })}
                  className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                    profile.colorAdjustments
                      ? 'bg-orange-600 focus:ring-orange-500'
                      : 'bg-gray-400 focus:ring-gray-500'
                  }`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                    profile.colorAdjustments ? 'translate-x-12' : 'translate-x-2'
                  }`} />
                </button>
                <p className={`text-sm mt-1 ${getCurrentFontClass()}`}>
                  {profile.colorAdjustments ? 'Using colors that are easier to distinguish for color vision differences' : 'Standard color scheme'}
                </p>
                
                {profile.colorAdjustments && (
                  <div className="mt-2 p-2 rounded border">
                    <p className={`text-xs font-bold mb-1 ${getCurrentFontClass()}`}>Color Adjustments Active:</p>
                    <div className="flex space-x-2">
                      <div className="w-6 h-6 bg-blue-600 rounded border-2 border-gray-300"></div>
                      <div className="w-6 h-6 bg-orange-600 rounded border-2 border-gray-300"></div>
                      <div className="w-6 h-6 bg-purple-600 rounded border-2 border-gray-300"></div>
                      <div className="w-6 h-6 bg-teal-600 rounded border-2 border-gray-300"></div>
                    </div>
                    <p className={`text-xs mt-1 ${getCurrentFontClass()}`}>Enhanced contrast and colorblind-friendly palette</p>
                  </div>
                )}
              </div>

              {/* Text Size */}
              <div>
                <label className={`font-bold mb-2 block ${getCurrentFontClass()}`}>Text Size: ({profile.fontSize}/6)</label>
                <div className={`p-3 border-2 rounded-lg mb-3 ${
                  profile.contrastMode === 'high' ? 'border-white' : 'border-gray-300'
                }`}>
                  <p className={getCurrentFontClass()}>Sample text at current size</p>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-sm">A</span>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    value={profile.fontSize}
                    onChange={(e) => updateProfile({ fontSize: parseInt(e.target.value) })}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xl">A</span>
                </div>
              </div>

              {/* Simplified Language */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className={`font-bold ${getCurrentFontClass()}`}>Simplified Language: {profile.simplifyText ? 'ON' : 'OFF'}</label>
                </div>
                <button
                  onClick={() => updateProfile({ simplifyText: !profile.simplifyText })}
                  className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                    profile.simplifyText
                      ? 'bg-green-600 focus:ring-green-500'
                      : 'bg-gray-400 focus:ring-gray-500'
                  }`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                    profile.simplifyText ? 'translate-x-12' : 'translate-x-2'
                  }`} />
                </button>
                <p className={`text-sm mt-1 ${getCurrentFontClass()}`}>
                  Current mode: {profile.simplifyText ? 'Simple words and short sentences' : 'Normal language'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
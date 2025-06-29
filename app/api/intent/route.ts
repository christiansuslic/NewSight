import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client only if API key is available
let openai: OpenAI | null = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Define possible intents
const INTENTS = {
  GET_NEWS: 'get_news',
  READ_ARTICLE: 'read_article',
  ZOOM_IN: 'zoom_in',
  CONTRAST_UP: 'contrast_up',
  SIMPLIFY_TEXT: 'simplify_text',
  STOP_AUDIO: 'stop_audio'
};

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    if (!openai) {
      console.warn('OpenAI API key not configured, using fallback classification');
      // Return a fallback intent classification
      return NextResponse.json({
        intent: classifyIntentFallback(text)
      });
    }

    // Use OpenAI to classify the intent
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Classify this user message into one of these intents: get_news, read_article, zoom_in, contrast_up, simplify_text, stop_audio.

          Examples:
          - "What's new today?" -> get_news
          - "Show me the news" -> get_news
          - "Read this article" -> read_article
          - "Read this to me" -> read_article
          - "Zoom in" -> zoom_in
          - "Make it bigger" -> zoom_in
          - "High contrast" -> contrast_up
          - "Better contrast" -> contrast_up
          - "Make it easier to read" -> simplify_text
          - "Use simple words" -> simplify_text
          - "Stop reading" -> stop_audio
          - "Stop audio" -> stop_audio

          Respond with only the intent name (e.g., "get_news").`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.1,
      max_tokens: 50
    });

    const response = completion.choices[0]?.message?.content?.trim();
    
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    // Validate the response is a valid intent
    const intent = Object.values(INTENTS).includes(response) ? response : classifyIntentFallback(text);

    return NextResponse.json({ intent });

  } catch (error) {
    console.error('Error in intent classification:', error);
    
    // Fallback to simple keyword matching
    try {
      const { text } = await request.json();
      return NextResponse.json({
        intent: classifyIntentFallback(text)
      });
    } catch (fallbackError) {
      return NextResponse.json(
        { error: 'Failed to process intent' },
        { status: 500 }
      );
    }
  }
}

// Fallback intent classification using simple keyword matching
function classifyIntentFallback(text: string): string {
  const lowerText = text.toLowerCase();
  
  // News-related keywords
  if (lowerText.includes('news') || lowerText.includes('headlines') || 
      lowerText.includes('what\'s new') || lowerText.includes('happening')) {
    return INTENTS.GET_NEWS;
  }
  
  // Read article keywords
  if (lowerText.includes('read') && (lowerText.includes('article') || 
      lowerText.includes('this') || lowerText.includes('aloud') || lowerText.includes('to me'))) {
    return INTENTS.READ_ARTICLE;
  }
  
  // Zoom keywords
  if (lowerText.includes('zoom in') || lowerText.includes('bigger') || 
      lowerText.includes('larger') || lowerText.includes('increase size')) {
    return INTENTS.ZOOM_IN;
  }
  
  // Contrast keywords
  if (lowerText.includes('contrast') || lowerText.includes('high contrast') || 
      lowerText.includes('better contrast') || lowerText.includes('dark mode')) {
    return INTENTS.CONTRAST_UP;
  }
  
  // Simplify text keywords
  if (lowerText.includes('simplify') || lowerText.includes('simple') || 
      lowerText.includes('easier to read') || lowerText.includes('easy words')) {
    return INTENTS.SIMPLIFY_TEXT;
  }
  
  // Stop audio keywords
  if (lowerText.includes('stop') && (lowerText.includes('audio') || 
      lowerText.includes('reading') || lowerText.includes('speaking'))) {
    return INTENTS.STOP_AUDIO;
  }
  
  // Default to get_news if unclear
  return INTENTS.GET_NEWS;
}
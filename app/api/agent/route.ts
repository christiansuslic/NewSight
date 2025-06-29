import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

interface AgentRequest {
  message: string;
  conversationId?: string;
}

interface AgentResponse {
  response: string;
  audioUrl?: string;
  conversationId?: string;
  action?: {
    type: string;
    data?: any;
  };
  ttsAvailable?: boolean;
}

// Initialize OpenAI client only if API key is available
let openai: OpenAI | null = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { message, conversationId }: AgentRequest = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "bIHbv24MWmeRgasZH58o";
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your .env.local file.' },
        { status: 500 }
      );
    }

    if (!openai) {
      console.error('OpenAI client not initialized');
      return NextResponse.json(
        { error: 'OpenAI service not available. Please check your API key configuration.' },
        { status: 500 }
      );
    }

    // CRITICAL FIX: Enhanced action detection with better simplified content handling
    const actionDetection = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an action classifier for an accessibility-focused voice assistant. Analyze the user's message and determine if they want to perform a specific action.

Available actions:
- GET_NEWS: User wants to get/fetch/see news or headlines
- ZOOM_IN: User wants to make text bigger/larger or zoom in
- ZOOM_OUT: User wants to make text smaller or zoom out  
- HIGH_CONTRAST: User wants to enable high contrast mode or dark mode
- NORMAL_CONTRAST: User wants to disable high contrast mode or return to normal colors
- READ_ARTICLE: User wants to read an article aloud or have something read to them (including specific articles like "read article 1", "read the NBA article", "read first article")
- READ_FULL_ARTICLE: User specifically wants to read the full/complete text of an article
- SIMPLIFY_TEXT: User wants to simplify complex text or make it easier to read
- STOP_AUDIO: User wants to stop audio playback or stop reading
- NONE: User is asking a general question or having a conversation

For READ_ARTICLE action, also extract any article identifier (number, keyword, or position like "first", "second", etc.)

Respond with only the action name (e.g., "GET_NEWS" or "NONE"). If it's READ_ARTICLE or READ_FULL_ARTICLE, you can add the identifier after a colon (e.g., "READ_ARTICLE:1" or "READ_ARTICLE:NBA").`
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 50,
      temperature: 0.1,
    });

    const detectedAction = actionDetection.choices[0]?.message?.content?.trim() || 'NONE';
    const [actionType, actionParam] = detectedAction.split(':');

    console.log('=== ACTION DETECTION DEBUG ===');
    console.log('User message:', message);
    console.log('Detected action:', detectedAction);
    console.log('Action type:', actionType);
    console.log('Action param:', actionParam);
    console.log('==============================');

    let responseText = '';
    let actionData = null;

    // CRITICAL FIX: Enhanced GET_NEWS handling with proper simplified content support
    if (actionType === 'GET_NEWS') {
      console.log('=== GET_NEWS ACTION DETECTED ===');
      
      try {
        // CRITICAL FIX: Fetch actual news data from the news API
        const newsResponse = await fetch(`${request.nextUrl.origin}/api/news`);
        
        if (!newsResponse.ok) {
          throw new Error('Failed to fetch news data');
        }
        
        const newsData = await newsResponse.json();
        const articles = newsData.articles || [];
        
        if (articles.length === 0) {
          responseText = "I'm sorry, I couldn't fetch any news articles right now. Please try again later.";
        } else {
          // Get top 3 articles for summary
          const top3Articles = articles.slice(0, 3);
          
          console.log('=== NEWS_SUMMARY EXECUTION ===');
          console.log('Number of articles fetched:', articles.length);
          console.log('Top 3 articles for summary:', top3Articles.map((a: { title: string }) => a.title));
          
          // CRITICAL FIX: Check if simplified mode is enabled from the message context
          const isSimplifiedMode = message.includes('IMPORTANT: User has simplified language mode enabled');
          console.log('Simplified mode detected:', isSimplifiedMode);
          
          // CRITICAL FIX: Process articles for simplified content if needed
          let articlesForSummary = [];
          
          if (isSimplifiedMode) {
            // Extract simplified article content from the message
            const availableStoriesMatch = message.match(/Available news stories:\s*([\s\S]*?)(?:User said:|$)/);
            
            if (availableStoriesMatch && availableStoriesMatch[1]) {
              const simplifiedArticlesList = availableStoriesMatch[1].trim();
              console.log('Using simplified articles from message:', simplifiedArticlesList.substring(0, 200) + '...');
              
              // Parse the simplified articles list
              const simplifiedLines = simplifiedArticlesList.split('\n').filter(line => line.trim().match(/^\d+\./));
              
              articlesForSummary = simplifiedLines.slice(0, 3).map((line, index) => {
                const cleanLine = line.replace(/^\d+\.\s*/, '').trim();
                const [title, ...descParts] = cleanLine.split(' - ');
                return {
                  title: title || `Article ${index + 1}`,
                  description: descParts.join(' - ') || 'No description available'
                };
              });
              
              console.log('Parsed simplified articles:', articlesForSummary);
            } else {
              // CRITICAL FIX: If no simplified content in message, simplify the original articles
              console.log('No simplified content found in message, simplifying original articles...');
              
              articlesForSummary = await Promise.all(
                top3Articles.map(async (article: { title: string; description: string }) => {

                  try {
                    // Simplify title
                    const titleResponse = await fetch(`${request.nextUrl.origin}/api/simplify`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: article.title })
                    });

                    // Simplify description
                    const descResponse = await fetch(`${request.nextUrl.origin}/api/simplify`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: article.description })
                    });

                    const titleData = titleResponse.ok ? await titleResponse.json() : null;
                    const descData = descResponse.ok ? await descResponse.json() : null;

                    return {
                      title: titleData?.simplified || article.title,
                      description: descData?.simplified || article.description
                    };
                  } catch (error) {
                    console.error('Error simplifying article:', error);
                    return {
                      title: article.title,
                      description: article.description
                    };
                  }
                })
              );
              
              console.log('Generated simplified articles:', articlesForSummary);
            }
          } else {
            // Use original article content
            articlesForSummary = top3Articles.map(article => ({
              title: article.title,
              description: article.description
            }));
            console.log('Using original articles for normal mode');
          }
          
          console.log('==============================');
          
          // Generate news summary using OpenAI with appropriate article content
          const summaryResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: `You are a helpful news assistant for people with disabilities. Create a warm, engaging summary of today's top news stories.

CRITICAL REQUIREMENTS:
1. Use ONLY the news articles provided below - do not add any other stories
2. Create a natural, conversational summary that sounds like a helpful friend or professional narrator
3. ${isSimplifiedMode ? 'Use simple words and short sentences (like for a 5th grader). Keep sentences under 15 words. Use common, easy words.' : 'Use clear, accessible language'}
4. Keep the summary under ${isSimplifiedMode ? '120' : '150'} words
5. Start with a friendly greeting like "Here's what's happening today..." or "Good news update for you..."
6. End with an offer to read any article in full by saying something like "I can read any of these articles in full if you'd like to hear more details"
7. Be warm and supportive, as you're helping people who may have visual or reading difficulties
8. ${isSimplifiedMode ? 'Remember: Use ONLY simple words that a 5th grader would understand. No complex terms.' : ''}

Today's top 3 news stories:
${articlesForSummary.map((article, index) => 
  `${index + 1}. ${article.title} - ${article.description}`
).join('\n')}

Create an engaging, accessible news summary using ONLY these stories.`
              },
              {
                role: "user",
                content: isSimplifiedMode ? "Give me today's news in simple words" : "Give me a summary of today's top news"
              }
            ],
            max_tokens: isSimplifiedMode ? 180 : 200,
            temperature: 0.7,
          });

          responseText = summaryResponse.choices[0]?.message?.content || 'Here are today\'s top news stories.';
          
          console.log('=== GENERATED NEWS SUMMARY ===');
          console.log('Summary text:', responseText);
          console.log('Summary length:', responseText.length);
          console.log('Simplified mode used:', isSimplifiedMode);
          console.log('===============================');
        }
        
      } catch (newsError) {
        console.error('Error fetching or processing news:', newsError);
        responseText = "I'm having trouble getting the latest news right now. Please try again in a moment.";
      }
      
      actionData = { type: 'GET_NEWS' };
      
    } else {
      // Handle other actions (existing logic)
      switch (actionType) {
        case 'ZOOM_IN':
          responseText = "I'm making the text bigger for you. The page should now be easier to read with larger text.";
          actionData = { type: 'ZOOM_IN' };
          break;

        case 'ZOOM_OUT':
          responseText = "I'm returning the text to normal size.";
          actionData = { type: 'ZOOM_OUT' };
          break;

        case 'HIGH_CONTRAST':
          responseText = "I'm enabling high contrast mode for you. The page now has white text on a black background for better visibility.";
          actionData = { type: 'HIGH_CONTRAST' };
          break;

        case 'NORMAL_CONTRAST':
          responseText = "I'm returning to normal contrast mode with the regular color scheme.";
          actionData = { type: 'NORMAL_CONTRAST' };
          break;

        case 'READ_ARTICLE':
          responseText = actionParam 
            ? `I'll read article ${actionParam} for you now.`
            : "I'll read the selected article for you now.";
          actionData = { 
            type: 'READ_ARTICLE', 
            data: { 
              articleIdentifier: actionParam,
              fullContent: false 
            } 
          };
          break;

        case 'READ_FULL_ARTICLE':
          responseText = actionParam 
            ? `I'll read the full content of article ${actionParam} for you now.`
            : "I'll read the full content of the selected article for you now.";
          actionData = { 
            type: 'READ_ARTICLE', 
            data: { 
              articleIdentifier: actionParam,
              fullContent: true 
            } 
          };
          break;

        case 'SIMPLIFY_TEXT':
          responseText = "I can help simplify complex text to make it easier to read. I'll show you an example of how I can break down complicated sentences into simpler ones.";
          actionData = { type: 'SIMPLIFY_TEXT' };
          break;

        case 'STOP_AUDIO':
          responseText = "I'm stopping all audio playback now.";
          actionData = { type: 'STOP_AUDIO' };
          break;

        default:
          // Generate a conversational response for general questions
          const conversationResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: `You are a helpful AI assistant focused on accessibility and helping people with disabilities. You can help with:

- Getting and reading news articles (including full article content)
- Making text bigger or smaller (zoom controls)
- Enabling high contrast mode for better visibility
- Simplifying complex text for easier reading
- Reading content aloud
- General conversation and assistance

Be friendly, helpful, and always mention relevant accessibility features when appropriate. Keep responses concise but informative.`
              },
              {
                role: "user",
                content: message
              }
            ],
            max_tokens: 300,
            temperature: 0.7,
          });

          responseText = conversationResponse.choices[0]?.message?.content || 'I received your message but could not generate a proper response.';
          break;
      }
    }

    // Try to generate audio for the response, but don't fail if TTS is unavailable
    let audioUrl = null;
    let ttsAvailable = true;
    
    if (elevenLabsApiKey) {
      try {
        console.log('Attempting to generate ElevenLabs audio...');
        const ttsResponse = await fetchWithRetry(`${request.nextUrl.origin}/api/elevenlabs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: responseText,
            voiceId: voiceId
          }),
        });

        if (ttsResponse.ok) {
          const ttsData = await ttsResponse.json();
          if (ttsData.audioUrl) {
            audioUrl = ttsData.audioUrl;
            console.log('ElevenLabs audio generated successfully');
          } else if (ttsData.fallback) {
            console.log('ElevenLabs TTS unavailable, continuing without audio');
            ttsAvailable = false;
          }
        } else {
          console.log('ElevenLabs TTS failed, continuing without audio');
          ttsAvailable = false;
        }
      } catch (ttsError) {
        console.log('TTS request failed, continuing without audio:', ttsError);
        ttsAvailable = false;
      }
    } else {
      console.log('ElevenLabs API key not configured, continuing without audio');
      ttsAvailable = false;
    }

    // Generate a simple conversation ID if none provided
    const finalConversationId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const response: AgentResponse = {
      response: responseText,
      audioUrl: audioUrl,
      conversationId: finalConversationId,
      action: actionData,
      ttsAvailable: ttsAvailable
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error calling OpenAI:', error);
    return NextResponse.json(
      { error: 'Failed to communicate with agent' },
      { status: 500 }
    );
  }
}

// Retry function with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, maxRetries: number = 2): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Always return the response - let the caller handle success/failure
      return response;
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Request failed, retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}
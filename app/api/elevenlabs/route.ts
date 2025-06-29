import { NextRequest, NextResponse } from 'next/server';

interface ElevenLabsRequest {
  text: string;
  voiceId: string;
}

interface ElevenLabsResponse {
  audioUrl?: string;
  error?: string;
  fallback?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { text, voiceId }: ElevenLabsRequest = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required and must be a string' },
        { status: 400 }
      );
    }

    if (!voiceId || typeof voiceId !== 'string') {
      return NextResponse.json(
        { error: 'VoiceId is required and must be a string' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      console.error('ELEVENLABS_API_KEY environment variable is not set');
      return NextResponse.json(
        { 
          error: 'ElevenLabs API key not configured',
          fallback: true 
        },
        { status: 200 } // Return 200 to allow graceful fallback
      );
    }

    try {
      // Call ElevenLabs TTS API with retry logic
      const audioBuffer = await callElevenLabsWithRetry(text, voiceId, apiKey);
      
      // Convert ArrayBuffer to Base64 for data URL
      const audioBase64 = Buffer.from(audioBuffer).toString('base64');
      const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;

      const response: ElevenLabsResponse = {
        audioUrl
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('ElevenLabs API error:', error);
      
      // Handle specific ElevenLabs errors gracefully
      let errorMessage = 'TTS service temporarily unavailable';
      let shouldFallback = true;
      
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          errorMessage = 'ElevenLabs authentication issue detected. The application will continue without voice features.';
          console.log('ElevenLabs 401 error - likely free tier disabled or API key issue. Falling back to text-only mode.');
        } else if (error.message.includes('429')) {
          errorMessage = 'ElevenLabs rate limit exceeded. Please wait before trying voice features again.';
        } else if (error.message.includes('500')) {
          errorMessage = 'ElevenLabs service temporarily unavailable.';
        }
      }
      
      // Return a successful response with fallback flag instead of an error
      return NextResponse.json(
        { 
          error: errorMessage,
          fallback: shouldFallback 
        },
        { status: 200 }
      );
    }

  } catch (error) {
    console.error('Error in ElevenLabs TTS endpoint:', error);
    
    return NextResponse.json(
      { 
        error: 'TTS service unavailable',
        fallback: true 
      },
      { status: 200 }
    );
  }
}

// Retry function with exponential backoff for ElevenLabs API
async function callElevenLabsWithRetry(text: string, voiceId: string, apiKey: string, maxRetries: number = 2): Promise<ArrayBuffer> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const elevenLabsResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            text: text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5,
              style: 0.0,
              use_speaker_boost: true
            }
          }),
        }
      );

      // If successful, return the audio buffer
      if (elevenLabsResponse.ok) {
        return await elevenLabsResponse.arrayBuffer();
      }

      // Handle 429 (rate limit) errors with retry logic
      if (elevenLabsResponse.status === 429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
        console.log(`ElevenLabs rate limit hit (429), retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // For other client errors (4xx except 429), don't retry - throw immediately with detailed error info
      if (elevenLabsResponse.status >= 400 && elevenLabsResponse.status < 500 && elevenLabsResponse.status !== 429) {
        const errorText = await elevenLabsResponse.text();
        console.error('ElevenLabs API client error:', elevenLabsResponse.status, errorText);
        
        // Parse error response for more detailed information
        let detailedError = '';
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.detail && errorData.detail.message) {
            detailedError = ` - ${errorData.detail.message}`;
          }
        } catch (parseError) {
          // If we can't parse the error, just use the status code
        }
        
        throw new Error(`ElevenLabs API error: ${elevenLabsResponse.status}${detailedError}`);
      }

      // For server errors (5xx), retry with exponential backoff
      if (elevenLabsResponse.status >= 500 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
        console.log(`ElevenLabs server error (${elevenLabsResponse.status}), retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If we've exhausted retries or it's not a retriable error
      const errorText = await elevenLabsResponse.text();
      console.error('ElevenLabs API error:', elevenLabsResponse.status, errorText);
      throw new Error(`ElevenLabs API error: ${elevenLabsResponse.status}`);

    } catch (error) {
      // If it's our last attempt, throw the error
      if (attempt === maxRetries) {
        throw error;
      }

      // If it's a network error or other non-HTTP error, retry
      if (!(error instanceof Error) || !error.message.includes('ElevenLabs API error:')) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`ElevenLabs request failed, retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If it's an HTTP error we already handled, don't retry
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded for ElevenLabs API');
}
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client only if API key is available
let openai: OpenAI | null = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

interface SimplifyRequest {
  text: string;
}

interface SimplifyResponse {
  simplified: string;
}

export async function POST(request: NextRequest) {
  try {
    const { text }: SimplifyRequest = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required and must be a string' },
        { status: 400 }
      );
    }

    if (text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text cannot be empty' },
        { status: 400 }
      );
    }

    if (!openai) {
      console.warn('OpenAI API key not configured, using fallback simplification');
      // Return a basic fallback simplification
      const simplified = simplifyTextFallback(text);
      return NextResponse.json({ simplified });
    }

    // Use OpenAI to simplify the text
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an expert at simplifying text for people with dyslexia and reading difficulties. 

Your task is to rewrite the given text to make it easier to read and understand. Follow these guidelines:

1. Use simple, common words instead of complex vocabulary
2. Break long sentences into shorter ones (max 15-20 words per sentence)
3. Use active voice instead of passive voice
4. Remove unnecessary jargon and technical terms
5. Use clear, direct language
6. Maintain the original meaning and key information
7. Use bullet points or numbered lists when appropriate
8. Keep paragraphs short (2-3 sentences max)

The goal is to make the content accessible while preserving all important information.`
        },
        {
          role: 'user',
          content: `Please simplify this text for someone with dyslexia:\n\n${text}`
        }
      ],
      temperature: 0.3,
      max_tokens: Math.min(2000, text.length * 2), // Reasonable limit based on input length
    });

    const simplified = completion.choices[0]?.message?.content?.trim();
    
    if (!simplified) {
      throw new Error('No response from OpenAI');
    }

    const response: SimplifyResponse = {
      simplified
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in text simplification:', error);
    
    // Fallback to basic simplification if OpenAI fails
    try {
      const { text } = await request.json();
      const simplified = simplifyTextFallback(text);
      return NextResponse.json({ simplified });
    } catch (fallbackError) {
      return NextResponse.json(
        { error: 'Failed to simplify text' },
        { status: 500 }
      );
    }
  }
}

// Fallback text simplification using basic rules
function simplifyTextFallback(text: string): string {
  // Basic simplification rules
  let simplified = text
    // Replace complex words with simpler alternatives
    .replace(/\butilize\b/gi, 'use')
    .replace(/\bfacilitate\b/gi, 'help')
    .replace(/\bdemonstrate\b/gi, 'show')
    .replace(/\bimplement\b/gi, 'do')
    .replace(/\bparticipate\b/gi, 'take part')
    .replace(/\baccommodate\b/gi, 'fit')
    .replace(/\binitiate\b/gi, 'start')
    .replace(/\bterminate\b/gi, 'end')
    .replace(/\bsubsequent\b/gi, 'next')
    .replace(/\bprevious\b/gi, 'before')
    .replace(/\badditional\b/gi, 'more')
    .replace(/\bnumerous\b/gi, 'many')
    .replace(/\bsignificant\b/gi, 'important')
    .replace(/\bcomprehensive\b/gi, 'complete')
    .replace(/\bfundamental\b/gi, 'basic')
    .replace(/\bessential\b/gi, 'needed')
    .replace(/\bappropriate\b/gi, 'right')
    .replace(/\beffective\b/gi, 'good')
    .replace(/\befficient\b/gi, 'fast')
    .replace(/\boptimal\b/gi, 'best')
    .replace(/\bmaximum\b/gi, 'most')
    .replace(/\bminimum\b/gi, 'least');

  // Split long sentences (basic approach)
  const sentences = simplified.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const shortenedSentences = sentences.map(sentence => {
    const words = sentence.trim().split(/\s+/);
    if (words.length > 20) {
      // Try to split at conjunctions
      const conjunctions = ['and', 'but', 'or', 'so', 'because', 'since', 'while', 'although'];
      for (const conj of conjunctions) {
        const conjIndex = words.findIndex(word => word.toLowerCase() === conj);
        if (conjIndex > 5 && conjIndex < words.length - 5) {
          const firstPart = words.slice(0, conjIndex).join(' ');
          const secondPart = words.slice(conjIndex).join(' ');
          return `${firstPart}. ${secondPart.charAt(0).toUpperCase() + secondPart.slice(1)}`;
        }
      }
    }
    return sentence.trim();
  });

  return shortenedSentences.join('. ') + '.';
}
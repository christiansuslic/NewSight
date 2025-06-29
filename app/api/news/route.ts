import { NextRequest, NextResponse } from 'next/server';

interface NewsAPIArticle {
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  content?: string;
  source: {
    name: string;
  };
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.NEWS_API_KEY;
    
    if (!apiKey) {
      console.error('NEWS_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'News API key not configured. Please add NEWS_API_KEY to your .env.local file.' },
        { status: 500 }
      );
    }

    // Fetch from NewsAPI.org with retry logic
    const data = await fetchNewsWithRetry(apiKey);

    if (data.status !== 'ok') {
      throw new Error(`NewsAPI returned status: ${data.status}`);
    }

    // Transform and limit to top 5 articles
    const articles = data.articles
      .filter(article => article.title && article.description && article.title !== '[Removed]')
      .slice(0, 5)
      .map(article => {
        // Clean up the content - NewsAPI often truncates with "..." or "[+X chars]"
        let fullContent = '';
        
        if (article.content && article.content !== '[Removed]') {
          fullContent = article.content
            .replace(/\[\+\d+\s*chars?\]$/g, '') // Remove "[+1234 chars]"
            .replace(/\[\+\d+\s*characters?\]$/g, '') // Remove "[+1234 characters]"
            .replace(/\.{3,}$/, '') // Remove trailing "..." 
            .trim();
        }
        
        // If content is still empty or very short, use description as fallback
        if (!fullContent || fullContent.length < 50) {
          fullContent = article.description || 'Full content not available for this article.';
        }

        return {
          title: article.title,
          description: article.description || 'No description available.',
          url: article.url,
          source: article.source.name,
          publishedAt: article.publishedAt,
          fullContent: fullContent
        };
      });

    if (articles.length === 0) {
      throw new Error('No valid articles found in NewsAPI response');
    }

    return NextResponse.json({
      articles
    });

  } catch (error) {
    console.error('Error fetching news:', error);
    
    // Return proper error instead of fallback data
    let errorMessage = 'Failed to fetch news';
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        errorMessage = 'Invalid News API key. Please check your API key configuration.';
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'News API rate limit exceeded. Please try again later.';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error while fetching news. Please check your connection.';
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// Retry function with exponential backoff for News API
async function fetchNewsWithRetry(apiKey: string, maxRetries: number = 3): Promise<NewsAPIResponse> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://newsapi.org/v2/top-headlines?country=us&pageSize=10', {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      // If successful, return the data
      if (response.ok) {
        const data: NewsAPIResponse = await response.json();
        return data;
      }

      // For client errors (4xx), don't retry - throw immediately
      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text();
        console.error('NewsAPI client error:', response.status, errorText);
        
        if (response.status === 401) {
          throw new Error('Invalid News API key. Please check your API key configuration.');
        } else if (response.status === 429) {
          throw new Error('News API rate limit exceeded. Please upgrade your plan or try again later.');
        } else {
          throw new Error(`NewsAPI error: ${response.status} ${response.statusText}`);
        }
      }

      // For server errors (5xx), retry with exponential backoff
      if (response.status >= 500 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`NewsAPI server error (${response.status}), retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If we've exhausted retries or it's not a server error
      throw new Error(`NewsAPI error: ${response.status} ${response.statusText}`);

    } catch (error) {
      // If it's our last attempt, throw the error
      if (attempt === maxRetries) {
        throw error;
      }

      // If it's a network error or other non-HTTP error, retry
      if (!(error instanceof Error) || !error.message.includes('NewsAPI error:')) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`NewsAPI request failed, retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If it's an HTTP error we already handled, don't retry
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded for NewsAPI');
}
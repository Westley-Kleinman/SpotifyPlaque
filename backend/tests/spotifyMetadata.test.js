/**
 * Unit Tests for Spotify Metadata Module
 * 
 * Tests the utility functions and API endpoint behavior for various scenarios
 * including valid URLs, invalid URLs, network errors, and edge cases.
 */

const { 
  fetchSpotifyMetadata, 
  isValidSpotifyTrackUrl, 
  formatDuration 
} = require('../src/spotifyMetadata');

// Mock spotify-url-info to control test scenarios
jest.mock('spotify-url-info', () => ({
  getData: jest.fn()
}));

const { getData } = require('spotify-url-info');

describe('Spotify Metadata Utility Functions', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isValidSpotifyTrackUrl', () => {
    test('should return true for valid HTTPS Spotify track URLs', () => {
      const validUrls = [
        'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh',
        'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh?si=abcdef123456',
        'https://open.spotify.com/track/1A2B3C4D5E6F7G8H9I0J'
      ];

      validUrls.forEach(url => {
        expect(isValidSpotifyTrackUrl(url)).toBe(true);
      });
    });

    test('should return true for valid Spotify URI format', () => {
      const validUris = [
        'spotify:track:4iV5W9uYEdYUVa79Axb7Rh',
        'spotify:track:1A2B3C4D5E6F7G8H9I0J'
      ];

      validUris.forEach(uri => {
        expect(isValidSpotifyTrackUrl(uri)).toBe(true);
      });
    });

    test('should return false for invalid URLs', () => {
      const invalidUrls = [
        null,
        undefined,
        '',
        123,
        'not-a-url',
        'https://google.com',
        'https://open.spotify.com/playlist/123',
        'https://open.spotify.com/album/123',
        'https://open.spotify.com/track/',
        'http://open.spotify.com/track/123' // HTTP instead of HTTPS
      ];

      invalidUrls.forEach(url => {
        expect(isValidSpotifyTrackUrl(url)).toBe(false);
      });
    });
  });

  describe('formatDuration', () => {
    test('should format duration correctly', () => {
      expect(formatDuration(30000)).toBe('0:30');
      expect(formatDuration(60000)).toBe('1:00');
      expect(formatDuration(125000)).toBe('2:05');
      expect(formatDuration(3661000)).toBe('61:01');
    });

    test('should handle edge cases', () => {
      expect(formatDuration(null)).toBe(null);
      expect(formatDuration(undefined)).toBe(null);
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration('not-a-number')).toBe(null);
    });
  });

  describe('fetchSpotifyMetadata', () => {
    const mockTrackData = {
      name: 'Test Song',
      artists: [{ name: 'Test Artist' }],
      images: [{ url: 'https://example.com/image.jpg' }],
      duration_ms: 180000
    };

    test('should fetch and format metadata correctly', async () => {
      getData.mockResolvedValue(mockTrackData);

      const result = await fetchSpotifyMetadata('https://open.spotify.com/track/test123');

      expect(result).toEqual({
        title: 'Test Song',
        artist: 'Test Artist',
        image: 'https://example.com/image.jpg',
        duration: '3:00'
      });
    });

    test('should handle missing optional fields gracefully', async () => {
      getData.mockResolvedValue({
        name: 'Test Song'
        // Missing artists, images, duration
      });

      const result = await fetchSpotifyMetadata('https://open.spotify.com/track/test123');

      expect(result).toEqual({
        title: 'Test Song',
        artist: null,
        image: null,
        duration: null
      });
    });

    test('should handle alternative data structure formats', async () => {
      getData.mockResolvedValue({
        name: 'Test Song',
        artist: 'Single Artist String', // Different format
        coverArt: {
          sources: [{ url: 'https://example.com/cover.jpg' }]
        },
        durationMs: 210000 // Different field name
      });

      const result = await fetchSpotifyMetadata('https://open.spotify.com/track/test123');

      expect(result).toEqual({
        title: 'Test Song',
        artist: 'Single Artist String',
        image: 'https://example.com/cover.jpg',
        duration: '3:30'
      });
    });

    test('should throw error for invalid URL', async () => {
      await expect(
        fetchSpotifyMetadata('invalid-url')
      ).rejects.toThrow('Invalid Spotify track URL format');
    });

    test('should handle network errors', async () => {
      getData.mockRejectedValue(new Error('fetch failed'));

      await expect(
        fetchSpotifyMetadata('https://open.spotify.com/track/test123')
      ).rejects.toThrow('Network error: Unable to fetch data from Spotify');
    });

    test('should handle 404 errors', async () => {
      getData.mockRejectedValue(new Error('404 Not Found'));

      await expect(
        fetchSpotifyMetadata('https://open.spotify.com/track/test123')
      ).rejects.toThrow('Track not found: The Spotify track may not exist or be unavailable');
    });

    test('should handle empty response', async () => {
      getData.mockResolvedValue(null);

      await expect(
        fetchSpotifyMetadata('https://open.spotify.com/track/test123')
      ).rejects.toThrow('No data received from Spotify');
    });
  });
});

describe('API Endpoint Integration Tests', () => {
  let app;
  let request;

  beforeAll(() => {
    app = require('../src/server');
    // Use supertest for API testing if available, otherwise mock
    try {
      const supertest = require('supertest');
      request = supertest(app);
    } catch (error) {
      console.log('Supertest not available, skipping integration tests');
      request = null;
    }
  });

  afterAll(() => {
    if (app && app.close) {
      app.close();
    }
  });

  test('should return health status', (done) => {
    if (!request) {
      done();
      return;
    }

    request
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('healthy');
        expect(res.body.service).toBe('spotify-plaque-backend');
      })
      .end(done);
  });

  test('should handle valid Spotify URL', (done) => {
    if (!request) {
      done();
      return;
    }

    getData.mockResolvedValue({
      name: 'Test Song',
      artists: [{ name: 'Test Artist' }],
      images: [{ url: 'https://example.com/image.jpg' }],
      duration_ms: 180000
    });

    request
      .post('/api/spotify-metadata')
      .send({ url: 'https://open.spotify.com/track/test123' })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.title).toBe('Test Song');
        expect(res.body.data.artist).toBe('Test Artist');
      })
      .end(done);
  });

  test('should handle missing URL parameter', (done) => {
    if (!request) {
      done();
      return;
    }

    request
      .post('/api/spotify-metadata')
      .send({})
      .expect(400)
      .expect((res) => {
        expect(res.body.error).toContain('Missing required field: url');
      })
      .end(done);
  });

  test('should handle invalid URL format', (done) => {
    if (!request) {
      done();
      return;
    }

    request
      .post('/api/spotify-metadata')
      .send({ url: 'invalid-url' })
      .expect(400)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('Invalid Spotify track URL format');
      })
      .end(done);
  });
});

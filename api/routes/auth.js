const express = require('express');
const axios = require('axios');
const router = express.Router();

// RocketChat API configuration
const ROCKETCHAT_URL = process.env.ROCKETCHAT_URL || 'http://localhost:3000';
const ROCKETCHAT_API = `${ROCKETCHAT_URL}/api/v1`;

/**
 * POST /api/v1/auth/login
 * Authenticate user via RocketChat
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    console.log(`[AUTH] Login attempt for: ${email}`);

    // Proxy authentication to RocketChat
    const rcResponse = await axios.post(
      `${ROCKETCHAT_API}/login`,
      {
        user: email,
        password: password,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      }
    );

    // Check if authentication was successful
    if (rcResponse.status !== 200 || rcResponse.data.status === 'error') {
      console.log(`[AUTH] Login failed for ${email}: ${rcResponse.data.message || 'Invalid credentials'}`);
      return res.status(401).json({
        success: false,
        message: rcResponse.data.message || 'Invalid email or password',
      });
    }

    const { userId, authToken, me } = rcResponse.data.data;

    console.log(`[AUTH] Login successful for ${email} (userId: ${userId})`);

    // Return standardized auth response
    res.json({
      success: true,
      userId: userId,
      authToken: authToken,
      username: me?.username || email.split('@')[0],
      email: me?.emails?.[0]?.address || email,
      name: me?.name || '',
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Authentication service is temporarily unavailable',
      });
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred during authentication',
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user info (verify session)
 */
router.get('/me', async (req, res) => {
  try {
    // Extract token from Authorization header or query param
    const authToken = req.headers['x-auth-token'] || 
                      req.headers.authorization?.replace('Bearer ', '') ||
                      req.query.token;
    const userId = req.headers['x-user-id'] || req.query.userId;

    if (!authToken || !userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Verify token with RocketChat
    const rcResponse = await axios.get(`${ROCKETCHAT_API}/me`, {
      headers: {
        'X-Auth-Token': authToken,
        'X-User-Id': userId,
      },
      validateStatus: (status) => status < 500,
    });

    if (rcResponse.status !== 200 || rcResponse.data.status === 'error') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    const user = rcResponse.data;

    res.json({
      success: true,
      userId: user._id,
      username: user.username,
      email: user.emails?.[0]?.address || '',
      name: user.name || '',
      roles: user.roles || [],
    });
  } catch (error) {
    console.error('[AUTH] /me error:', error.message);

    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred while verifying session',
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user (invalidate RocketChat token)
 */
router.post('/logout', async (req, res) => {
  try {
    const authToken = req.headers['x-auth-token'] || req.headers.authorization?.replace('Bearer ', '');
    const userId = req.headers['x-user-id'];

    if (authToken && userId) {
      // Logout from RocketChat
      await axios.post(
        `${ROCKETCHAT_API}/logout`,
        {},
        {
          headers: {
            'X-Auth-Token': authToken,
            'X-User-Id': userId,
          },
          validateStatus: () => true, // Ignore errors
        }
      );
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('[AUTH] Logout error:', error.message);
    // Still return success - client should clear token anyway
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }
});

module.exports = router;

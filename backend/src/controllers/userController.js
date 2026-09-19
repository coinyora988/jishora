/**
 * User Controller
 */

const User = require('../models/User');
const Referral = require('../models/Referral');

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const stats = await User.getStats(req.user.id);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          country: user.country,
          avatarUrl: user.avatar_url,
          vipLevel: user.vip_level,
          referralCode: user.referral_code,
          createdAt: user.created_at
        },
        stats
      }
    });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { username, phone, country, avatarUrl } = req.body;

    // Only forward fields the client actually sent. Passing `undefined` through
    // built a `SET phone = ?` clause with an undefined bind value, which mysql2
    // rejects, so any partial update (e.g. username only) failed outright.
    const updates = {};
    if (username !== undefined) updates.username = username;
    if (phone !== undefined) updates.phone = phone;
    if (country !== undefined) updates.country = country;
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // A username collision would otherwise surface as an opaque 500.
    if (updates.username) {
      const existing = await User.findByUsername(updates.username);
      if (existing && existing.id !== req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'That username is already taken'
        });
      }
    }

    await User.update(req.user.id, updates);

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

const getReferrals = async (req, res, next) => {
  try {
    const referrals = await Referral.getUserReferrals(req.user.id);
    const stats = await Referral.getStats(req.user.id);

    res.json({
      success: true,
      data: {
        referrals,
        stats
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getReferrals
};

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Account } from '../models/Account';
import { UserAccount } from '../models/UserAccount';
import { User } from '../models/User';
import { Invitation } from '../models/Invitation';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Get all accounts for the current user
export const getAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const memberships = await UserAccount.find({ userId: req.userId })
      .populate('accountId', 'name ownerId createdAt')
      .sort({ createdAt: -1 });

    const accounts = memberships.map((membership: any) => ({
      _id: membership.accountId._id,
      name: membership.accountId.name,
      role: membership.role,
      ownerId: membership.accountId.ownerId,
      createdAt: membership.accountId.createdAt,
    }));

    res.json(accounts);
  } catch (error: any) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch accounts' });
  }
};

// Create a new account
export const createAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Account name is required' });
      return;
    }

    // Create account
    const account = new Account({
      name: name.trim(),
      ownerId: req.userId,
    });
    await account.save();

    // Create membership with owner role
    const membership = new UserAccount({
      userId: req.userId,
      accountId: account._id,
      role: 'owner',
    });
    await membership.save();

    res.status(201).json({
      _id: account._id,
      name: account.name,
      role: 'owner',
      ownerId: account.ownerId,
      createdAt: account.createdAt,
    });
  } catch (error: any) {
    console.error('Create account error:', error);
    res.status(500).json({ error: error.message || 'Failed to create account' });
  }
};

// Add a user to an account (by email)
export const addUserToAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId } = req.params;
    const { email, role = 'member' } = req.body;

    if (!email || !email.trim()) {
      res.status(400).json({ error: 'User email is required' });
      return;
    }

    if (!['admin', 'member'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be "admin" or "member"' });
      return;
    }

    // Verify account exists
    const account = await Account.findById(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Check if requester has permission (owner or admin)
    const requesterMembership = await UserAccount.findOne({
      userId: req.userId,
      accountId: accountId,
    });

    if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
      res.status(403).json({ error: 'You do not have permission to add users to this account' });
      return;
    }

    // Find user by email
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      res.status(404).json({ error: 'User not found with this email' });
      return;
    }

    // Check if user is already a member
    const existingMembership = await UserAccount.findOne({
      userId: user._id,
      accountId: accountId,
    });

    if (existingMembership) {
      res.status(400).json({ error: 'User is already a member of this account' });
      return;
    }

    // Create membership
    const membership = new UserAccount({
      userId: user._id,
      accountId: accountId,
      role: role,
    });
    await membership.save();

    res.json({
      success: true,
      message: 'User added to account successfully',
      membership: {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: membership.role,
      },
    });
  } catch (error: any) {
    console.error('Add user to account error:', error);
    res.status(500).json({ error: error.message || 'Failed to add user to account' });
  }
};

// Get members of an account
export const getAccountMembers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId } = req.params;

    // Verify user is a member of this account
    const membership = await UserAccount.findOne({
      userId: req.userId,
      accountId: accountId,
    });

    if (!membership) {
      res.status(403).json({ error: 'Access denied. You are not a member of this account.' });
      return;
    }

    const memberships = await UserAccount.find({ accountId })
      .populate('userId', 'email name')
      .sort({ role: 1, createdAt: 1 });

    const members = memberships.map((m: any) => ({
      _id: m.userId._id,
      email: m.userId.email,
      name: m.userId.name,
      role: m.role,
      joinedAt: m.createdAt,
    }));

    res.json(members);
  } catch (error: any) {
    console.error('Get account members error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch account members' });
  }
};

// Remove a user from an account
export const removeUserFromAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, userId } = req.params;

    // Verify account exists
    const account = await Account.findById(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Check if requester has permission (owner or admin)
    const requesterMembership = await UserAccount.findOne({
      userId: req.userId,
      accountId: accountId,
    });

    if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
      res.status(403).json({ error: 'You do not have permission to remove users from this account' });
      return;
    }

    // Prevent removing the owner
    if (account.ownerId.toString() === userId) {
      res.status(400).json({ error: 'Cannot remove the account owner' });
      return;
    }

    // Prevent removing yourself if you're the only admin/owner
    if (req.userId === userId) {
      const adminCount = await UserAccount.countDocuments({
        accountId: accountId,
        role: { $in: ['owner', 'admin'] },
      });
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot remove yourself. At least one admin or owner is required.' });
        return;
      }
    }

    // Remove membership
    await UserAccount.findOneAndDelete({
      userId: userId,
      accountId: accountId,
    });

    res.json({ success: true, message: 'User removed from account successfully' });
  } catch (error: any) {
    console.error('Remove user from account error:', error);
    res.status(500).json({ error: error.message || 'Failed to remove user from account' });
  }
};

// Update user role in account
export const updateUserRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, userId } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be "admin" or "member"' });
      return;
    }

    // Verify account exists
    const account = await Account.findById(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Check if requester has permission (owner or admin)
    const requesterMembership = await UserAccount.findOne({
      userId: req.userId,
      accountId: accountId,
    });

    if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
      res.status(403).json({ error: 'You do not have permission to update user roles' });
      return;
    }

    // Prevent changing owner role
    if (account.ownerId.toString() === userId) {
      res.status(400).json({ error: 'Cannot change the account owner role' });
      return;
    }

    // Update membership
    const membership = await UserAccount.findOneAndUpdate(
      { userId: userId, accountId: accountId },
      { role: role },
      { new: true }
    );

    if (!membership) {
      res.status(404).json({ error: 'User membership not found' });
      return;
    }

    res.json({ success: true, message: 'User role updated successfully', role: membership.role });
  } catch (error: any) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: error.message || 'Failed to update user role' });
  }
};

// Invite a user to an account (by email)
export const inviteUserToAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId } = req.params;
    const { email, role = 'member' } = req.body;

    if (!email || !email.trim()) {
      res.status(400).json({ error: 'User email is required' });
      return;
    }

    if (!['admin', 'member'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be "admin" or "member"' });
      return;
    }

    // Verify account exists
    const account = await Account.findById(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Check if requester has permission (owner or admin)
    const requesterMembership = await UserAccount.findOne({
      userId: req.userId,
      accountId: accountId,
    });

    if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
      res.status(403).json({ error: 'You do not have permission to invite users to this account' });
      return;
    }

    const emailLower = email.trim().toLowerCase();
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: emailLower });
    
    if (existingUser) {
      // User exists - check if already a member
      const existingMembership = await UserAccount.findOne({
        userId: existingUser._id,
        accountId: accountId,
      });

      if (existingMembership) {
        res.status(400).json({ error: 'User is already a member of this account' });
        return;
      }

      // User exists but not a member - add them directly
      const membership = new UserAccount({
        userId: existingUser._id,
        accountId: accountId,
        role: role,
      });
      await membership.save();

      res.json({
        success: true,
        message: 'User added to account successfully',
        user: {
          _id: existingUser._id,
          email: existingUser.email,
          name: existingUser.name,
          role: role,
        },
        addedDirectly: true,
      });
      return;
    }

    // User doesn't exist - check if there's already a pending invitation
    const existingInvitation = await Invitation.findOne({
      accountId: accountId,
      email: emailLower,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });

    if (existingInvitation) {
      res.status(400).json({ error: 'An invitation has already been sent to this email' });
      return;
    }

    // Generate unique token for invitation
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');

    // Create invitation for new user
    const invitation = new Invitation({
      accountId: accountId,
      email: emailLower,
      role: role,
      invitedBy: req.userId,
      token: token, // Generate token explicitly to avoid validation issues
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
    await invitation.save();

    // TODO: Send invitation email here with link like: /accept-invitation?token=xxx
    // In production, you'd send an email with the invitation link

    res.json({
      success: true,
      message: 'Invitation sent successfully. User will be added when they accept the invitation.',
      invitation: {
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        token: invitation.token, // In production, don't return token - send via email
      },
      addedDirectly: false,
    });
  } catch (error: any) {
    console.error('Invite user to account error:', error);
    res.status(500).json({ error: error.message || 'Failed to invite user to account' });
  }
};

// Get pending invitations for an account
export const getAccountInvitations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId } = req.params;

    // Verify user is a member of this account
    const membership = await UserAccount.findOne({
      userId: req.userId,
      accountId: accountId,
    });

    if (!membership) {
      res.status(403).json({ error: 'Access denied. You are not a member of this account.' });
      return;
    }

    // Only owners and admins can see invitations
    if (!['owner', 'admin'].includes(membership.role)) {
      res.status(403).json({ error: 'You do not have permission to view invitations' });
      return;
    }

    const invitations = await Invitation.find({
      accountId: accountId,
      status: 'pending',
    }).select('email role invitedBy expiresAt createdAt token')
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 });

    const result = invitations.map((inv: any) => ({
      _id: inv._id,
      email: inv.email,
      role: inv.role,
      invitedBy: {
        name: inv.invitedBy.name,
        email: inv.invitedBy.email,
      },
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      token: inv.token, // Include token so users can copy the invitation link
    }));

    res.json(result);
  } catch (error: any) {
    console.error('Get account invitations error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch invitations' });
  }
};

// Cancel/delete an invitation
export const cancelInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountId, invitationId } = req.params;

    // Verify account exists
    const account = await Account.findById(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Check if requester has permission (owner or admin)
    const requesterMembership = await UserAccount.findOne({
      userId: req.userId,
      accountId: accountId,
    });

    if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
      res.status(403).json({ error: 'You do not have permission to cancel invitations' });
      return;
    }

    // Delete invitation
    const invitation = await Invitation.findOneAndDelete({
      _id: invitationId,
      accountId: accountId,
    });

    if (!invitation) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    res.json({ success: true, message: 'Invitation cancelled successfully' });
  } catch (error: any) {
    console.error('Cancel invitation error:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel invitation' });
  }
};

// Accept an invitation (public endpoint - no auth required initially)
export const acceptInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body as { token?: string };

    if (!token) {
      res.status(400).json({ error: 'Invitation token is required' });
      return;
    }

    // Find invitation by token
    const invitation = await Invitation.findOne({
      token: token,
      status: 'pending',
    }).populate('accountId');

    if (!invitation) {
      res.status(404).json({ error: 'Invalid or expired invitation' });
      return;
    }

    // Check if invitation has expired
    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      await invitation.save();
      res.status(400).json({ error: 'Invitation has expired' });
      return;
    }

    // Check if user is already a member
    const existingUser = await User.findOne({ email: invitation.email });
    if (existingUser) {
      const existingMembership = await UserAccount.findOne({
        userId: existingUser._id,
        accountId: invitation.accountId,
      });

      if (existingMembership) {
        invitation.status = 'accepted';
        await invitation.save();
        res.status(400).json({ error: 'You are already a member of this account' });
        return;
      }
    }

    res.json({
      success: true,
      invitation: {
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        accountId: (invitation.accountId as any)._id,
        accountName: (invitation.accountId as any).name,
      },
      message: 'Invitation is valid. Please login or register to accept.',
    });
  } catch (error: any) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: error.message || 'Failed to process invitation' });
  }
};

// Accept invitation and create account if needed (public endpoint)
export const acceptInvitationAndCreateAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body as { token?: string };

    if (!token) {
      res.status(400).json({ error: 'Invitation token is required' });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      res.status(500).json({ error: 'JWT_SECRET is not configured' });
      return;
    }

    // Find invitation by token
    const invitation = await Invitation.findOne({
      token: token,
      status: 'pending',
    }).populate('accountId');

    if (!invitation) {
      res.status(404).json({ error: 'Invalid or expired invitation' });
      return;
    }

    // Check if invitation has expired
    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      await invitation.save();
      res.status(400).json({ error: 'Invitation has expired' });
      return;
    }

    // Check if user already exists
    let user = await User.findOne({ email: invitation.email });
    let requiresPasswordSetup = false;

    if (!user) {
      // Create new user without password (will be set later)
      user = new User({
        email: invitation.email,
        requiresPasswordSetup: true,
      });
      await user.save();
      requiresPasswordSetup = true;
    } else {
      // Check if user needs password setup
      requiresPasswordSetup = user.requiresPasswordSetup || false;
    }

    // Check if user is already a member
    const existingMembership = await UserAccount.findOne({
      userId: user._id,
      accountId: invitation.accountId,
    });

    if (existingMembership) {
      invitation.status = 'accepted';
      await invitation.save();
      res.status(400).json({ error: 'You are already a member of this account' });
      return;
    }

    // Generate JWT token for the user
    const authToken = jwt.sign({ userId: user._id.toString() }, jwtSecret, {
      expiresIn: '7d',
    });

    res.json({
      success: true,
      token: authToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name || '',
        requiresPasswordSetup: requiresPasswordSetup,
      },
      invitation: {
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        accountId: (invitation.accountId as any)._id,
        accountName: (invitation.accountId as any).name,
      },
    });
  } catch (error: any) {
    console.error('Accept invitation and create account error:', error);
    res.status(500).json({ error: error.message || 'Failed to accept invitation' });
  }
};

// Setup password for user (after accepting invitation)
export const setupPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { password, name } = req.body;

    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password is required and must be at least 6 characters' });
      return;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    user.passwordHash = passwordHash;
    user.requiresPasswordSetup = false;

    // Update name if provided
    if (name && name.trim()) {
      user.name = name.trim();
    }

    await user.save();

    res.json({
      success: true,
      message: 'Password set successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    console.error('Setup password error:', error);
    res.status(500).json({ error: error.message || 'Failed to setup password' });
  }
};

// Complete invitation acceptance (after user is authenticated)
export const completeInvitationAcceptance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Invitation token is required' });
      return;
    }

    // Find invitation by token
    const invitation = await Invitation.findOne({
      token: token,
      status: 'pending',
    });

    if (!invitation) {
      res.status(404).json({ error: 'Invalid or expired invitation' });
      return;
    }

    // Check if invitation has expired
    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      await invitation.save();
      res.status(400).json({ error: 'Invitation has expired' });
      return;
    }

    // Verify the user's email matches the invitation email
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      res.status(403).json({ error: 'This invitation was sent to a different email address' });
      return;
    }

    // Check if user is already a member
    const existingMembership = await UserAccount.findOne({
      userId: req.userId,
      accountId: invitation.accountId,
    });

    if (existingMembership) {
      invitation.status = 'accepted';
      await invitation.save();
      res.status(400).json({ error: 'You are already a member of this account' });
      return;
    }

    // Create membership
    const membership = new UserAccount({
      userId: req.userId,
      accountId: invitation.accountId,
      role: invitation.role,
    });
    await membership.save();

    // Mark invitation as accepted
    invitation.status = 'accepted';
    await invitation.save();

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      membership: {
        accountId: invitation.accountId,
        role: membership.role,
      },
    });
  } catch (error: any) {
    console.error('Complete invitation acceptance error:', error);
    res.status(500).json({ error: error.message || 'Failed to accept invitation' });
  }
};

// Update user profile (name and email)
export const updateUserProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { name, email } = req.body;

    // Users can only update their own profile, or admins/owners can update members in their accounts
    if (req.userId !== userId) {
      // Check if requester is admin/owner of any account that the target user belongs to
      const requesterMemberships = await UserAccount.find({
        userId: req.userId,
        role: { $in: ['owner', 'admin'] },
      });

      if (requesterMemberships.length === 0) {
        res.status(403).json({ error: 'You can only update your own profile' });
        return;
      }

      // Check if target user is a member of at least one account where requester is admin/owner
      const targetUserMemberships = await UserAccount.find({ userId: userId });
      const sharedAccounts = requesterMemberships.some((rm) =>
        targetUserMemberships.some((tm) => tm.accountId.toString() === rm.accountId.toString())
      );

      if (!sharedAccounts) {
        res.status(403).json({ error: 'You can only update profiles of users in your accounts' });
        return;
      }
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Update name if provided
    if (name !== undefined && name.trim()) {
      user.name = name.trim();
    }

    // Update email if provided and different
    if (email !== undefined && email.trim() && email.toLowerCase() !== user.email.toLowerCase()) {
      // Check if email is already taken
      const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
      if (existingUser && existingUser._id.toString() !== userId) {
        res.status(400).json({ error: 'Email is already in use' });
        return;
      }
      user.email = email.trim().toLowerCase();
    }

    await user.save();

    res.json({
      success: true,
      message: 'User profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    console.error('Update user profile error:', error);
    res.status(500).json({ error: error.message || 'Failed to update user profile' });
  }
};


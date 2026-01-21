import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { Account } from '../models/Account';
import { UserAccount } from '../models/UserAccount';
import { AuthRequest } from '../middleware/auth';

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length === 0) {
    throw new Error('JWT_SECRET environment variable is not set or is empty. Please configure it in your .env file.');
  }
  return secret;
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ email, passwordHash, name });
    await user.save();

    // Create default account for new user
    const defaultAccount = new Account({
      name: `${name}'s Account`,
      ownerId: user._id,
    });
    await defaultAccount.save();

    // Create membership with owner role
    const membership = new UserAccount({
      userId: user._id,
      accountId: defaultAccount._id,
      role: 'owner',
    });
    await membership.save();

    const token = jwt.sign({ userId: user._id.toString() }, getJwtSecret(), {
      expiresIn: '7d',
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
      defaultAccountId: defaultAccount._id.toString(),
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    if (error.message && error.message.includes('JWT_SECRET')) {
      res.status(500).json({ 
        error: 'Server configuration error: JWT_SECRET is not set. Please add it to your .env file.' 
      });
      return;
    }
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check if user has any accounts, if not create a default one (migration for existing users)
    const existingMemberships = await UserAccount.find({ userId: user._id });
    if (existingMemberships.length === 0) {
      // Create default account for existing user
      const defaultAccount = new Account({
        name: `${user.name}'s Account`,
        ownerId: user._id,
      });
      await defaultAccount.save();

      // Create membership with owner role
      const membership = new UserAccount({
        userId: user._id,
        accountId: defaultAccount._id,
        role: 'owner',
      });
      await membership.save();
    }

    const token = jwt.sign({ userId: user._id.toString() }, getJwtSecret(), {
      expiresIn: '7d',
    });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    if (error.message && error.message.includes('JWT_SECRET')) {
      res.status(500).json({ 
        error: 'Server configuration error: JWT_SECRET is not set. Please add it to your .env file.' 
      });
      return;
    }
    res.status(500).json({ error: error.message || 'Login failed' });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get user's accounts
    const memberships = await UserAccount.find({ userId: req.userId })
      .populate('accountId', 'name ownerId')
      .sort({ createdAt: -1 });

    const accounts = memberships.map((m: any) => ({
      _id: m.accountId._id,
      name: m.accountId.name,
      role: m.role,
      ownerId: m.accountId.ownerId,
    }));

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      accounts,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};


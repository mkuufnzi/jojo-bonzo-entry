import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';
import { Strategy as TwitterStrategy } from 'passport-twitter-oauth2';
import { AuthService } from '../services/auth.service';
import { UserRepository } from '../repositories/user.repository';
import { config } from './env';

const authService = new AuthService();
const userRepository = new UserRepository();

// Helper to handle social auth logic
const handleSocialAuth = async (
    provider: 'google' | 'facebook' | 'linkedin' | 'twitter',
    profileId: string,
    email: string | undefined,
    displayName: string,
    photoUrl: string | undefined,
    done: any
) => {
    try {
        const user = await authService.handleSocialLogin(provider, profileId, email, displayName, photoUrl);
        return done(null, user);
    } catch (error) {
        console.error(`[SocialAuth] Error for ${provider}:`, error);
        return done(error);
    }
};

if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: `${config.APP_URL}/auth/google/callback`,
        passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;
        const photo = profile.photos?.[0]?.value;
        await handleSocialAuth('google', profile.id, email, profile.displayName, photo, done);
    }
    ));
}

if (config.FACEBOOK_APP_ID && config.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
        clientID: config.FACEBOOK_APP_ID,
        clientSecret: config.FACEBOOK_APP_SECRET,
        callbackURL: `${config.APP_URL}/auth/facebook/callback`,
        profileFields: ['id', 'displayName', 'photos', 'email'],
        enableProof: true,
        graphAPIVersion: 'v12.0'
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        const email = profile.emails?.[0]?.value;
        const photo = profile.photos?.[0]?.value;
        await handleSocialAuth('facebook', profile.id, email, profile.displayName, photo, done);
    }
    ));
}

if (config.LINKEDIN_KEY && config.LINKEDIN_SECRET) {
    passport.use(new LinkedInStrategy({
        clientID: config.LINKEDIN_KEY,
        clientSecret: config.LINKEDIN_SECRET,
        callbackURL: `${config.APP_URL}/auth/linkedin/callback`,
        scope: ['r_emailaddress', 'r_liteprofile'],
    },
    async (accessToken, refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;
        const photo = profile.photos?.[0]?.value;
        await handleSocialAuth('linkedin', profile.id, email, profile.displayName, photo, done);
    }
    ));
}

if (config.X_CLIENT_ID && config.X_CLIENT_SECRET) {
    passport.use('twitter', new TwitterStrategy({
        clientID: config.X_CLIENT_ID,
        clientSecret: config.X_CLIENT_SECRET,
        callbackURL: `${config.APP_URL}/auth/x/callback`,
        clientType: 'confidential',
        pkce: true,
        state: true,
        authorizationURL: 'https://twitter.com/i/oauth2/authorize',
        tokenURL: 'https://api.twitter.com/2/oauth2/token'
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
            const email = profile.emails?.[0]?.value;
            const photo = profile.photos?.[0]?.value;
            await handleSocialAuth('twitter', profile.id, email, profile.displayName || profile.username, photo, done);
        } catch (error) {
            done(error);
        }
    }
    ));
}



passport.serializeUser((user: any, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
    try {
        const user = await userRepository.findById(id);
        done(null, user);
    } catch (error) {
        done(error);
    }
});

export default passport;

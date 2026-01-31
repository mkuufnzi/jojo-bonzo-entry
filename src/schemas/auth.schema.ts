import { z } from 'zod';

export const loginSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(1, 'Password is required')
    })
});

export const initialRegisterSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address')
    })
});

export const completeRegistrationSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        name: z.string().min(2, 'Name must be at least 2 characters'),
        confirmPassword: z.string()
    }).refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ["confirmPassword"],
    })
});

// Backwards compatibility if needed, or we can update consumers
export const registerSchema = completeRegistrationSchema;

export const forgotPasswordSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address')
    })
});

export const verify2faSchema = z.object({
    body: z.object({
        code: z.string().length(6, 'Authentication code must be 6 digits').regex(/^\d+$/, 'Code must be numeric')
    })
});

export const resendVerificationSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address')
    })
});


export class EmailTemplateService {
    
    private getLayout(content: string, title: string = 'Notification'): string {
        const year = new Date().getFullYear();
        return `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${title}</title>
    <style>
        body { background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
        .container { max-width: 600px; margin: 0 auto; display: block; padding: 20px; }
        .content { background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 32px; }
        .header { text-align: center; padding-bottom: 24px; border-bottom: 1px solid #f4f4f5; margin-bottom: 24px; }
        .footer { text-align: center; color: #a1a1aa; font-size: 12px; margin-top: 24px; }
        .btn { display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; text-align: center; }
        .btn:hover { background-color: #1d4ed8; }
        h1, h2, h3 { color: #18181b; margin-top: 0; }
        p { color: #52525b; margin-bottom: 16px; font-size: 15px; line-height: 24px; }
        strong { color: #18181b; }
        .code-box { background-color: #f4f4f5; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 24px; font-weight: 700; letter-spacing: 4px; text-align: center; color: #18181b; margin: 24px 0; }
        .link { color: #2563eb; text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="content">
            <div class="header">
               <span style="font-size: 20px; font-weight: 800; color: #18181b; letter-spacing: -0.5px;">Floovioo </span>
            </div>
            ${content}
        </div>
        <div class="footer">
            <p>&copy; ${year} Floovioo . All rights reserved.<br>
            Automating your document workflows.</p>
        </div>
    </div>
</body>
</html>`;
    }

    renderWelcomeEmail(name: string): string {
        const content = `
            <h2>Welcome, ${name}!</h2>
            <p>We are excited to help you automate your document workflows with Floovioo .</p>
            <p>Get started by exploring our suite of tools or setting up your first workflow.</p>
            <div style="text-align: center; margin-top: 32px;">
                <a href="${process.env.APP_URL}/dashboard" class="btn">Go to Dashboard</a>
            </div>
        `;
        return this.getLayout(content, 'Welcome to Floovioo ');
    }

    renderTwoFactorCode(code: string, reason: string = 'Login'): string {
        const title = reason === 'Login' ? 'Authentication Code' : `${reason} Code`;
        const action = reason === 'Login' ? 'complete your login' : 'complete your request';
        
        const content = `
            <div style="text-align: center;">
                <h2>${title}</h2>
                <p>Please use the following code to ${action}:</p>
                <div class="code-box">${code}</div>
                <p>This code will expire in 10 minutes.</p>
                <p style="font-size: 13px; color: #71717a;">If you did not request this, please secure your account immediately.</p>
            </div>
        `;
        return this.getLayout(content, `Your ${reason} Code`);
    }

    renderVerificationEmail(url: string, password?: string): string {
        let extra = '';
        if (password) {
            extra = `<p>Your temporary password is: <strong>${password}</strong></p>`;
        }
        const content = `
            <h2>Verify your Email</h2>
            <p>Please confirm your email address to activate your account.</p>
            ${extra}
            <div style="text-align: center; margin-top: 32px;">
                <a href="${url}" class="btn">Verify Email</a>
            </div>
            <p style="font-size: 13px; margin-top: 24px;">Or copy this link: <a href="${url}" class="link">${url}</a></p>
        `;
        return this.getLayout(content, 'Verify your Email');
    }

    renderPasswordReset(password: string): string {
         const content = `
            <h2>Password Reset</h2>
            <p>Your password has been successfully reset.</p>
            <p>Your new password is: <strong>${password}</strong></p>
            <p>Please login and change it immediately.</p>
            <div style="text-align: center; margin-top: 32px;">
                <a href="${process.env.APP_URL}/auth/login" class="btn">Login Now</a>
            </div>
        `;
        return this.getLayout(content, 'Password Reset');
    }
    
    renderNotification(subject: string, body: string, link?: string): string {
         let action = '';
         if(link) {
             action = `<div style="text-align: center; margin-top: 32px;"><a href="${link}" class="btn">View Details</a></div>`;
         }
         const content = `
            <h2>${subject}</h2>
            <p>${body}</p>
            ${action}
        `;
        return this.getLayout(content, subject);
    }
}

export const emailTemplateService = new EmailTemplateService();

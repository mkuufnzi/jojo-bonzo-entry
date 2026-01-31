import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { emailService } from '../services/email.service';
import { webhookService } from '../services/webhook.service';
import { n8nPayloadFactory } from '../services/n8n/n8n-payload.factory';

export class FormController {
  static async submitInterest(req: Request, res: Response) {
    try {
      const { email, interest, source } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Save to database
      const lead = await prisma.lead.create({
        data: {
          email,
          interest: interest || 'general',
          source: source || 'web',
        },
      });

      // Trigger n8n webhook (Standardized)
      const n8nContext = {
          serviceId: 'crm-core',
          serviceTenantId: 'lead-capture',
          appId: 'system-webform',
          requestId: `lead_${lead.id.substring(0, 8)}`
      };
      
      const envelope = n8nPayloadFactory.createEventPayload('new_lead', lead, email, n8nContext);
      webhookService.sendTrigger('crm', 'new_lead', envelope);

      // Send notification to admin
      try {
        // Don't await this if we want to return fast, but for now we await to catch errors
        // We can also fire and forget if we don't care about the result
        emailService.sendNotification(
          `New Lead: ${interest}`,
          `New interest registered.\n\nEmail: ${email}\nInterest: ${interest}\nSource: ${source}`
        ).catch(err => console.error('Background email error:', err));
      } catch (emailError) {
        console.error('Error initiating notification:', emailError);
      }

      // Optionally send confirmation to user (can be added later)

      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.json({ success: true, message: 'Thank you! We will keep you updated.' });
      } else {
        // If it's a standard form post, redirect back with a success query param
        return res.redirect('back');
      }
    } catch (error) {
      console.error('Error submitting interest:', error);
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
      return res.redirect('back');
    }
  }
}

import axios from 'axios';
import { Service } from '@prisma/client';
import { ToolStrategy, ToolContext } from '../tool.interface';
import { AppError } from '../../../lib/AppError';

export class HttpStrategy implements ToolStrategy {
    async execute(service: Service, payload: any, context?: ToolContext): Promise<any> {
        const s = service as any;
        if (!s.endpointUrl) {
            throw new AppError(`Service ${service.name} is configured for HTTP execution but has no endpointUrl`, 500);
        }

        const config = (s.config as any) || {};
        const method = config.method || 'POST';
        const headers = config.headers || {
            'Content-Type': 'application/json',
            'User-Agent': 'Floovioo-Doc-Tools/1.0'
        };

        try {
            // Inject attribution info into payload
            const extendedPayload = {
                ...payload,
                _attribution: {
                    userId: context?.userId,
                    userEmail: context?.userEmail,
                    appId: context?.appId
                }
            };

            const response = await axios({
                method,
                url: s.endpointUrl,
                data: extendedPayload,
                headers,
                timeout: config.timeout || 30000 // Default 30s timeout
            });

            return response.data;
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.message || 'External tool execution failed';
            throw new AppError(`Tool execution error: ${errorMessage}`, error.response?.status || 502);
        }
    }
}

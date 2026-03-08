import { Response } from 'express';
import { logger } from '../lib/logger';

interface SseClient {
    id: string;
    res: Response;
    businessId: string;
}

class SseService {
    private clients: Map<string, SseClient> = new Map();

    /**
     * Add a new SSE client
     */
    addClient(businessId: string, res: Response): string {
        const id = Date.now().toString() + Math.random().toString(36).substring(2);
        
        const client: SseClient = {
            id,
            res,
            businessId
        };
        
        this.clients.set(id, client);
        logger.info({ businessId, clientId: id }, '[SSE] Client connected');
        
        // Remove client when connection drops
        res.on('close', () => {
            this.removeClient(id);
        });

        // Send an initial heartbeat
        this.sendToClient(client, { type: 'ping', data: { timestamp: new Date().toISOString() } });

        return id;
    }

    /**
     * Remove an SSE client
     */
    removeClient(clientId: string) {
        if (this.clients.has(clientId)) {
            const client = this.clients.get(clientId);
            logger.info({ businessId: client?.businessId, clientId }, '[SSE] Client disconnected');
            this.clients.delete(clientId);
        }
    }

    /**
     * Broadcast an event to all clients belonging to a specific business
     */
    broadcast(businessId: string, eventType: string, data: any) {
        let sentCount = 0;
        for (const client of this.clients.values()) {
            if (client.businessId === businessId) {
                this.sendToClient(client, { type: eventType, data });
                sentCount++;
            }
        }
        
        if (sentCount > 0) {
            logger.debug({ businessId, eventType, clients: sentCount }, '[SSE] Event broadcasted');
        }
    }

    private sendToClient(client: SseClient, payload: any) {
        try {
            client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
        } catch (error) {
            logger.warn({ clientId: client.id }, '[SSE] Error sending to client, removing connection');
            this.removeClient(client.id);
        }
    }
}

export const sseService = new SseService();

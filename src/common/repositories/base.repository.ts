
import { PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';

/**
 * Base Repository
 * Enforces standard CRUD operations and error handling.
 * All Domain Repositories MUST extend this class.
 */
export abstract class BaseRepository<T, CreateInput, UpdateInput> {
    protected db: PrismaClient;
    protected abstract modelName: string;

    constructor() {
        this.db = prisma;
    }

    /**
     * Get the Prisma delegate for the specific model.
     * Must be implemented by subclasses to return e.g. this.db.user
     */
    protected abstract getDelegate(): any;

    async findById(id: string): Promise<T | null> {
        try {
            return await this.getDelegate().findUnique({ where: { id } });
        } catch (error) {
            this.handleError('findById', error, { id });
            return null;
        }
    }

    async create(data: CreateInput): Promise<T> {
        try {
            return await this.getDelegate().create({ data });
        } catch (error) {
            this.handleError('create', error, data);
            throw error;
        }
    }

    async update(id: string, data: UpdateInput): Promise<T> {
        try {
            return await this.getDelegate().update({
                where: { id },
                data
            });
        } catch (error) {
            this.handleError('update', error, { id, data });
            throw error;
        }
    }

    async delete(id: string): Promise<T> {
        try {
            return await this.getDelegate().delete({ where: { id } });
        } catch (error) {
            this.handleError('delete', error, { id });
            throw error;
        }
    }

    protected handleError(method: string, error: any, context?: any) {
        logger.error({
            err: error,
            model: this.modelName,
            method,
            context
        }, `[Repository] ${this.modelName}.${method} failed`);
    }
}

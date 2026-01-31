import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './env';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Floovioo  API',
      version: '1.0.0',
      description: 'Professional document processing API for generating, converting, and manipulating documents at scale. Use your X-API-KEY for authentication.',
      contact: {
        name: 'Floovioo Support',
        email: 'support@floovioo.com',
      },
    },
    servers: [
      {
        url: config.APP_URL + '/api',
        description: 'Current Environment (' + config.NODE_ENV + ')',
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-KEY',
        }
      },
    },
    security: [
      {
        apiKeyAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'], // Path to the API docs
};

export const specs = swaggerJsdoc(options);

/**
 * Azure Blob Storage Client
 * 
 * Handles file storage operations with Azure Blob Storage.
 * Per architecture.md: Store raw files in Azure BLOB Storage
 */

import { BlobServiceClient, ContainerClient, BlockBlobClient } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { BlobUploadResult, DocumentServiceConfig } from '../types';

/**
 * BlobStorageClient handles all Azure Blob Storage operations
 */
export class BlobStorageClient {
  private blobServiceClient: BlobServiceClient;
  private containerClient: ContainerClient;
  private containerName: string;

  constructor(config: DocumentServiceConfig['azure']) {
    this.containerName = config.containerName;
    this.blobServiceClient = BlobServiceClient.fromConnectionString(config.connectionString);
    this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
  }

  /**
   * Initialize the blob storage container
   * Creates the container if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      await this.containerClient.createIfNotExists({
        access: 'blob', // Allow public read access to blobs
      });
    } catch (error) {
      console.error('Failed to initialize blob storage container:', error);
      throw error;
    }
  }

  /**
   * Upload a file to blob storage
   * 
   * @param buffer - File content as buffer
   * @param originalFilename - Original filename for extension
   * @param mimeType - MIME type for content type header
   * @returns Upload result with blob URL and path
   */
  async uploadFile(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string
  ): Promise<BlobUploadResult> {
    try {
      // Generate unique blob path: YYYY/MM/DD/uuid.ext
      const blobPath = this.generateBlobPath(originalFilename);
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobPath);

      // Upload with content type
      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: mimeType,
        },
        metadata: {
          originalFilename: encodeURIComponent(originalFilename),
          uploadedAt: new Date().toISOString(),
        },
      });

      return {
        success: true,
        blobUrl: blockBlobClient.url,
        blobPath: blobPath,
      };
    } catch (error) {
      console.error('Failed to upload file to blob storage:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error',
      };
    }
  }

  /**
   * Delete a file from blob storage
   * 
   * @param blobPath - Path to the blob in the container
   * @returns True if deletion was successful
   */
  async deleteFile(blobPath: string): Promise<boolean> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobPath);
      await blockBlobClient.delete();
      return true;
    } catch (error) {
      console.error('Failed to delete file from blob storage:', error);
      return false;
    }
  }

  /**
   * Check if a blob exists
   * 
   * @param blobPath - Path to the blob
   * @returns True if the blob exists
   */
  async exists(blobPath: string): Promise<boolean> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobPath);
      return await blockBlobClient.exists();
    } catch (error) {
      console.error('Failed to check blob existence:', error);
      return false;
    }
  }

  /**
   * Get a download URL for a blob (with SAS token for private containers)
   * 
   * @param blobPath - Path to the blob
   * @returns Download URL
   */
  getDownloadUrl(blobPath: string): string {
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobPath);
    return blockBlobClient.url;
  }

  /**
   * Generate a unique blob path with date-based organization
   * Format: YYYY/MM/DD/uuid.ext
   * 
   * @param originalFilename - Original filename for extension
   * @returns Generated blob path
   */
  private generateBlobPath(originalFilename: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const uuid = uuidv4();
    const ext = path.extname(originalFilename).toLowerCase();
    
    return `${year}/${month}/${day}/${uuid}${ext}`;
  }
}

/**
 * Create a mock blob storage client for testing
 */
export function createMockBlobStorageClient(): BlobStorageClient {
  const mockClient = {
    initialize: async () => {},
    uploadFile: async (buffer: Buffer, originalFilename: string, mimeType: string): Promise<BlobUploadResult> => {
      const uuid = uuidv4();
      const ext = path.extname(originalFilename).toLowerCase();
      const blobPath = `test/2024/01/01/${uuid}${ext}`;
      return {
        success: true,
        blobUrl: `https://testaccount.blob.core.windows.net/documents/${blobPath}`,
        blobPath: blobPath,
      };
    },
    deleteFile: async () => true,
    exists: async () => true,
    getDownloadUrl: (blobPath: string) => `https://testaccount.blob.core.windows.net/documents/${blobPath}`,
  };
  
  return mockClient as unknown as BlobStorageClient;
}

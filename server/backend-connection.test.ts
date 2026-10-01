import { describe, it, expect } from "vitest";
import axios from "axios";
import { ENV } from "./_core/env";

/**
 * Test suite for inverse-iq backend API connection
 */

describe("Backend API Connection", () => {
  it("should connect to inverse-iq backend health endpoint", async () => {
    const backendUrl = ENV.inverseiqBackendUrl;
    
    expect(backendUrl).toBeDefined();
    expect(backendUrl).not.toBe("");

    try {
      const response = await axios.get(`${backendUrl}/api/health`, {
        timeout: 10000,
      });

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
    } catch (error: any) {
      // If connection fails, provide helpful error message
      if (error.code === "ECONNREFUSED") {
        throw new Error(
          `Backend server is not running at ${backendUrl}. Please start the inverse-iq backend server.`
        );
      } else if (error.code === "ETIMEDOUT") {
        throw new Error(
          `Connection to ${backendUrl} timed out. Please check the URL and network connectivity.`
        );
      } else {
        throw new Error(
          `Failed to connect to backend: ${error.message}`
        );
      }
    }
  }, 15000); // 15 second timeout for this test

  it("should retrieve AI engine stats from backend", async () => {
    const backendUrl = ENV.inverseiqBackendUrl;

    const response = await axios.get(`${backendUrl}/api/ai/stats`, {
      timeout: 10000,
    });

    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(response.data).toHaveProperty("success");
  }, 15000);
});

// Learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom"

// Mock environment variables for tests
// Polyfills for node environment used by jest (CommonJS-friendly)
const util = require('util')
global.TextEncoder = util.TextEncoder
global.TextDecoder = util.TextDecoder

// TransformStream polyfill for libraries expecting Web Streams in Node
if (!global.TransformStream) {
  try {
    const { TransformStream } = require('stream/web')
    global.TransformStream = TransformStream
  } catch (_) {
    // Node version without stream/web
    global.TransformStream = function () {}
  }
}

// Fetch polyfill for Node environment
if (typeof global.fetch !== 'function') {
  const fetchImpl = require('node-fetch')
  global.fetch = fetchImpl.default || fetchImpl
  global.Headers = fetchImpl.Headers
  global.Request = fetchImpl.Request
  global.Response = fetchImpl.Response
}

// structuredClone polyfill for libraries expecting it in Node
if (typeof global.structuredClone !== 'function') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj))
}

// Mock S3 uploads in tests to avoid real AWS calls
jest.mock('@/lib/s3-uploader', () => ({
  S3Uploader: class {
    async uploadImage() {
      return {
        url: 'https://s3.local/test.png',
        key: 'test/key.png',
        contentType: 'image/png',
        size: 1024,
      }
    }
  },
}))
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "test-access-key"
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "test-secret-key"
process.env.AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || "test-bucket"
process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1"

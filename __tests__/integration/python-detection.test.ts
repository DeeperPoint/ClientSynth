/**
 * @jest-environment node
 */
/**
 * Python interpreter detection for PDF generation.
 *
 * On Windows, `python3` is normally a Microsoft Store "app execution alias":
 * it exits with status 9009 and prints "Python was not found; run without
 * arguments to install from the Microsoft Store..." to stderr.
 *
 * Detection used to accept a candidate when `status === 0 || stderr.length > 0`,
 * so that stub matched on the very first candidate and was selected as the
 * interpreter — even with a perfectly good `python` on the same machine. Every
 * PDF operation then failed with the Store message as its error.
 *
 * Detection now requires an actual `Python X.Y` version banner.
 */

const mockSpawnSync = jest.fn()

jest.mock("child_process", () => ({
  spawn: jest.fn(),
  spawnSync: (...args: any[]) => mockSpawnSync(...args),
}))

jest.mock("@/lib/s3-uploader", () => ({ S3Uploader: jest.fn().mockImplementation(() => ({})) }))

import { resolvePythonCommand } from "@/lib/pdf-generator"

/** The Microsoft Store alias stub. */
const STORE_STUB = {
  status: 9009,
  stdout: Buffer.from(""),
  stderr: Buffer.from(
    "Python was not found; run without arguments to install from the Microsoft Store, " +
      "or disable this shortcut from Settings > Apps > Advanced app settings > App execution aliases.",
  ),
}

const realPython = (version: string) => ({
  status: 0,
  stdout: Buffer.from(`Python ${version}\n`),
  stderr: Buffer.from(""),
})

/** Python 2 printed its version banner on stderr. */
const legacyPython = (version: string) => ({
  status: 0,
  stdout: Buffer.from(""),
  stderr: Buffer.from(`Python ${version}\n`),
})

const notFound = { error: new Error("spawn ENOENT"), status: null, stdout: null, stderr: null }

beforeEach(() => {
  jest.clearAllMocks()
})

describe("resolvePythonCommand", () => {
  it("skips the Windows Store stub and picks the real interpreter", () => {
    mockSpawnSync.mockImplementation((cmd: string) => {
      if (cmd === "python3") return STORE_STUB
      if (cmd === "python") return realPython("3.11.6")
      return realPython("3.13.2")
    })

    expect(resolvePythonCommand()).toBe("python")
  })

  it("prefers python3 when it is a genuine interpreter", () => {
    mockSpawnSync.mockImplementation((cmd: string) =>
      cmd === "python3" ? realPython("3.12.0") : realPython("3.11.6"),
    )

    expect(resolvePythonCommand()).toBe("python3")
  })

  it("falls through to the py launcher when the others are unusable", () => {
    mockSpawnSync.mockImplementation((cmd: string) => {
      if (cmd === "python3") return STORE_STUB
      if (cmd === "python") return notFound
      return realPython("3.13.2")
    })

    expect(resolvePythonCommand()).toBe("py")
  })

  it("accepts a version banner printed on stderr", () => {
    mockSpawnSync.mockImplementation((cmd: string) =>
      cmd === "python3" ? legacyPython("3.9.1") : notFound,
    )

    expect(resolvePythonCommand()).toBe("python3")
  })

  it("ignores a candidate that failed to spawn at all", () => {
    mockSpawnSync.mockImplementation((cmd: string) => (cmd === "py" ? realPython("3.13.2") : notFound))

    expect(resolvePythonCommand()).toBe("py")
  })

  it("defaults to python3 when nothing usable is found", () => {
    mockSpawnSync.mockImplementation(() => STORE_STUB)

    expect(resolvePythonCommand()).toBe("python3")
  })
})

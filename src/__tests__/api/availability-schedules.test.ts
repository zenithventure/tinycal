import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mock Data ───

const TEST_USER = {
  id: "user-123",
  name: "Alice",
  email: "alice@example.com",
  timezone: "America/New_York",
  plan: "FREE",
  defaultAvailabilityScheduleId: null,
}

const TEST_SCHEDULE = {
  id: "sched-123",
  userId: TEST_USER.id,
  name: "Work Hours",
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const TEST_RULES = [
  {
    id: "rule-1",
    availabilityScheduleId: TEST_SCHEDULE.id,
    dayOfWeek: 1,
    date: null,
    startTime: "09:00",
    endTime: "17:00",
    enabled: true,
  },
  {
    id: "rule-2",
    availabilityScheduleId: TEST_SCHEDULE.id,
    dayOfWeek: 5,
    date: null,
    startTime: "09:00",
    endTime: "12:00",
    enabled: true,
  },
]

// ─── Mocks ───

const mockGetAuthenticatedUser = vi.fn()
const mockPrisma = {
  availabilitySchedule: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  availabilityRule: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  eventType: {
    count: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
}

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: (...args: any[]) => mockGetAuthenticatedUser(...args),
}))

vi.mock("@/lib/prisma", () => ({
  default: mockPrisma,
}))

// ─── Helpers ───

function makeRequest(body: any, method: string = "POST"): Request {
  return new Request("http://localhost/api/availability/schedules", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeIdRequest(id: string, body: any, method: string = "GET"): Request {
  return new Request(`http://localhost/api/availability/schedules/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(method !== "GET" && { body: JSON.stringify(body) }),
  })
}

// ─── Setup ───

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuthenticatedUser.mockResolvedValue(TEST_USER)
  mockPrisma.availabilitySchedule.create.mockResolvedValue({
    ...TEST_SCHEDULE,
    rules: TEST_RULES,
  })
  mockPrisma.availabilitySchedule.findMany.mockResolvedValue([
    { ...TEST_SCHEDULE, rules: TEST_RULES },
  ])
  mockPrisma.availabilitySchedule.findFirst.mockResolvedValue({
    ...TEST_SCHEDULE,
    rules: TEST_RULES,
  })
  mockPrisma.availabilitySchedule.findUnique.mockResolvedValue({
    ...TEST_SCHEDULE,
    rules: TEST_RULES,
  })
  mockPrisma.availabilitySchedule.update.mockResolvedValue({
    ...TEST_SCHEDULE,
    rules: TEST_RULES,
  })
  mockPrisma.availabilityRule.deleteMany.mockResolvedValue({ count: 2 })
  mockPrisma.availabilityRule.createMany.mockResolvedValue({ count: 2 })
  mockPrisma.eventType.count.mockResolvedValue(0)
  mockPrisma.user.update.mockResolvedValue({ ...TEST_USER, defaultAvailabilityScheduleId: TEST_SCHEDULE.id })
})

// ─── Tests ───

describe("POST /api/availability/schedules", () => {
  let handler: typeof import("@/app/api/availability/schedules/route")

  beforeEach(async () => {
    handler = await import("@/app/api/availability/schedules/route")
  })

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null)
    const res = await handler.POST(makeRequest({ name: "Work Hours" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when name is missing", async () => {
    const res = await handler.POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it("creates a schedule with name and rules", async () => {
    const res = await handler.POST(
      makeRequest({
        name: "Work Hours",
        rules: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
        ],
      })
    )

    expect(res.status).toBe(201)
    expect(mockPrisma.availabilitySchedule.create).toHaveBeenCalled()
  })

  it("sets schedule as default", async () => {
    const res = await handler.POST(
      makeRequest({
        name: "Work Hours",
        isDefault: true,
        rules: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
      })
    )

    expect(res.status).toBe(201)
    expect(mockPrisma.availabilitySchedule.updateMany).toHaveBeenCalled()
    expect(mockPrisma.user.update).toHaveBeenCalled()
  })
})

describe("GET /api/availability/schedules", () => {
  let handler: typeof import("@/app/api/availability/schedules/route")

  beforeEach(async () => {
    handler = await import("@/app/api/availability/schedules/route")
  })

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null)
    const res = await handler.GET()
    expect(res.status).toBe(401)
  })

  it("returns all schedules for user", async () => {
    const res = await handler.GET()
    expect(res.status).toBe(200)
    expect(mockPrisma.availabilitySchedule.findMany).toHaveBeenCalled()
  })
})

describe("GET /api/availability/schedules/[id]", () => {
  let handler: typeof import("@/app/api/availability/schedules/[id]/route")

  beforeEach(async () => {
    handler = await import("@/app/api/availability/schedules/[id]/route")
  })

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null)
    const res = await handler.GET(
      makeIdRequest("sched-123", null),
      { params: { id: "sched-123" } }
    )
    expect(res.status).toBe(401)
  })

  it("returns 404 when schedule not found", async () => {
    mockPrisma.availabilitySchedule.findFirst.mockResolvedValue(null)
    const res = await handler.GET(
      makeIdRequest("sched-999", null),
      { params: { id: "sched-999" } }
    )
    expect(res.status).toBe(404)
  })

  it("returns schedule for valid id", async () => {
    const res = await handler.GET(
      makeIdRequest("sched-123", null),
      { params: { id: "sched-123" } }
    )
    expect(res.status).toBe(200)
  })
})

describe("PUT /api/availability/schedules/[id]", () => {
  let handler: typeof import("@/app/api/availability/schedules/[id]/route")

  beforeEach(async () => {
    handler = await import("@/app/api/availability/schedules/[id]/route")
  })

  it("updates schedule name", async () => {
    const res = await handler.PUT(
      makeIdRequest("sched-123", { name: "Updated" }, "PUT"),
      { params: { id: "sched-123" } }
    )

    expect(res.status).toBe(200)
    expect(mockPrisma.availabilitySchedule.update).toHaveBeenCalled()
  })

  it("returns 404 when schedule not found", async () => {
    mockPrisma.availabilitySchedule.findFirst.mockResolvedValue(null)
    const res = await handler.PUT(
      makeIdRequest("sched-999", { name: "Updated" }, "PUT"),
      { params: { id: "sched-999" } }
    )
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/availability/schedules/[id]", () => {
  let handler: typeof import("@/app/api/availability/schedules/[id]/route")

  beforeEach(async () => {
    handler = await import("@/app/api/availability/schedules/[id]/route")
  })

  it("returns 404 when schedule not found", async () => {
    mockPrisma.availabilitySchedule.findFirst.mockResolvedValue(null)
    const res = await handler.DELETE(
      makeIdRequest("sched-999", null, "DELETE"),
      { params: { id: "sched-999" } }
    )
    expect(res.status).toBe(404)
  })

  it("returns 400 when schedule linked to event types", async () => {
    mockPrisma.eventType.count.mockResolvedValue(2)

    const res = await handler.DELETE(
      makeIdRequest("sched-123", null, "DELETE"),
      { params: { id: "sched-123" } }
    )

    expect(res.status).toBe(400)
  })

  it("deletes schedule", async () => {
    const res = await handler.DELETE(
      makeIdRequest("sched-123", null, "DELETE"),
      { params: { id: "sched-123" } }
    )

    expect(res.status).toBe(200)
    expect(mockPrisma.availabilitySchedule.delete).toHaveBeenCalled()
  })
})

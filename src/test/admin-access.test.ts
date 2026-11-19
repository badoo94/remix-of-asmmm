import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { accessQuery } from "@/lib/auth";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  role: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
    rpc: mocks.role,
  },
}));

describe("Account access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens administration for the restored owner role", async () => {
    mocks.profile.mockResolvedValue({ data: { id: "owner", is_premium: true } });
    mocks.role.mockResolvedValue({ data: true });
    const access = await new QueryClient().fetchQuery(accessQuery("owner"));
    expect(access.isAdmin).toBe(true);
    expect(access.isPremium).toBe(true);
    expect(mocks.role).toHaveBeenCalledWith("has_role", { _user_id: "owner", _role: "admin" });
  });

  it("does not give subsequent standard users administration access", async () => {
    mocks.profile.mockResolvedValue({ data: { id: "reader", is_premium: false } });
    mocks.role.mockResolvedValue({ data: false });
    const access = await new QueryClient().fetchQuery(accessQuery("reader"));
    expect(access.isAdmin).toBe(false);
    expect(access.isPremium).toBe(false);
  });
});
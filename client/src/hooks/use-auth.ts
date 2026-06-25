import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type AuthUser = { id: string; username: string };

export type AuthStatus = {
  bootstrapped: boolean;
  user: AuthUser | null;
};

export function useAuth() {
  const { data, isLoading } = useQuery<AuthStatus>({
    queryKey: ["/api/auth/status"],
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return {
    bootstrapped: data?.bootstrapped ?? false,
    user: data?.user ?? null,
    isLoading,
  };
}

export function useLogout() {
  const queryClient = useQueryClient();
  return async () => {
    await apiRequest("POST", "/api/auth/logout");
    queryClient.setQueryData(["/api/auth/status"], {
      bootstrapped: true,
      user: null,
    });
  };
}

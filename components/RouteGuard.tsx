export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
    else if (!loading && profile && profile.role !== 'admin') router.replace('/');
  }, [loading, session, profile, router]);

  if (loading) return <LoadingScreen />;
  if (!session || profile?.role !== 'admin') return null;
  return <>{children}</>;
}

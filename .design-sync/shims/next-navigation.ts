// design-sync preview shim for `next/navigation`. Outside a mounted Next.js
// app router, useRouter() throws an invariant and the card renders blank.
export function useRouter() {
  return {
    back() {},
    forward() {},
    prefetch() {},
    push(_href: string) {},
    refresh() {},
    replace(_href: string) {},
  };
}

export function usePathname(): string {
  return "/en";
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

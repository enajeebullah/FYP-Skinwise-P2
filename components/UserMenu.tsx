interface UserMenuProps {
  email: string;
  fullName: string | null;
}

export default function UserMenu({ email, fullName }: UserMenuProps) {
  const displayName = fullName || email.split("@")[0] || "SkinWISE user";

  return (
    <div className="user-menu">
      <span className="user-avatar" aria-hidden="true">
        {displayName.slice(0, 1).toUpperCase()}
      </span>
      <span className="user-identity" title={email}>{displayName}</span>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="focus-ring user-logout"
        >
          Log out
        </button>
      </form>
    </div>
  );
}

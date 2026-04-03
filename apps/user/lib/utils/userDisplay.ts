export type UserDisplayProfile = {
  id: string;
  email: string | null;
  name: string | null;
};

export function createUserDisplayMaps(
  users?: UserDisplayProfile[] | null,
): {
  emailById: Record<string, string>;
  nameById: Record<string, string>;
} {
  const emailById: Record<string, string> = {};
  const nameById: Record<string, string> = {};

  users?.forEach((user) => {
    const normalizedEmail = user.email?.trim() || "-";
    const normalizedName = user.name?.trim() || user.email?.trim() || "-";

    emailById[user.id] = normalizedEmail;
    nameById[user.id] = normalizedName;
  });

  return { emailById, nameById };
}

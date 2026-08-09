import type { BootstrapResponse } from "../../shared/contracts";

export const demoBootstrap: BootstrapResponse = {
  user: {
    id: "demo-user",
    name: "Louisa",
    email: "louisa@example.com",
    image: null,
  },
  households: [
    {
      id: "demo-household",
      name: "The Fox Den",
      slug: "the-fox-den",
      role: "owner",
      memberCount: 2,
      defaultLanguage: "en",
      timezone: "Europe/Brussels",
      theme: "meadow",
    },
  ],
  activeHousehold: {
    id: "demo-household",
    name: "The Fox Den",
    slug: "the-fox-den",
    role: "owner",
    memberCount: 2,
    defaultLanguage: "en",
    timezone: "Europe/Brussels",
    theme: "meadow",
  },
};

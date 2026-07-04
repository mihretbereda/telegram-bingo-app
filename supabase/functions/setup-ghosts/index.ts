import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const ADMIN_TELEGRAM_ID = 676350518;

const GHOST_PROFILES = [
  { first_name: "Abebe",    last_name: "Girma",      username: "abebe_g"    },
  { first_name: "Tigist",   last_name: "Bekele",     username: "tigist_b"   },
  { first_name: "Dawit",    last_name: "Haile",      username: "dawit_h"    },
  { first_name: "Meron",    last_name: "Tadesse",    username: "meron_t"    },
  { first_name: "Yonas",    last_name: "Alemu",      username: "yonas_a"    },
  { first_name: "Selam",    last_name: "Tesfaye",    username: "selam_t"    },
  { first_name: "Biruk",    last_name: "Mengistu",   username: "biruk_m"    },
  { first_name: "Hana",     last_name: "Wolde",      username: "hana_w"     },
  { first_name: "Kaleb",    last_name: "Assefa",     username: "kaleb_a"    },
  { first_name: "Saba",     last_name: "Desta",      username: "saba_d"     },
  { first_name: "Natnael",  last_name: "Kebede",     username: "natnael_k"  },
  { first_name: "Lidya",    last_name: "Gebre",      username: "lidya_g"    },
  { first_name: "Samuel",   last_name: "Teshome",    username: "samuel_t"   },
  { first_name: "Rahel",    last_name: "Worku",      username: "rahel_w"    },
  { first_name: "Abel",     last_name: "Fekadu",     username: "abel_f"     },
  { first_name: "Eden",     last_name: "Girma",      username: "eden_g"     },
  { first_name: "Mikias",   last_name: "Hailu",      username: "mikias_h"   },
  { first_name: "Bethel",   last_name: "Solomon",    username: "bethel_s"   },
  { first_name: "Henok",    last_name: "Tesfaye",    username: "henok_t"    },
  { first_name: "Mahlet",   last_name: "Bekele",     username: "mahlet_b"   },
  { first_name: "Robel",    last_name: "Tadesse",    username: "robel_t"    },
  { first_name: "Winta",    last_name: "Haile",      username: "winta_h"    },
  { first_name: "Bereket",  last_name: "Alemu",      username: "bereket_a"  },
  { first_name: "Tsion",    last_name: "Mengistu",   username: "tsion_m"    },
  { first_name: "Eyob",     last_name: "Wolde",      username: "eyob_w"     },
  { first_name: "Liya",     last_name: "Assefa",     username: "liya_a"     },
  { first_name: "Amanuel",  last_name: "Girma",      username: "amanuel_g"  },
  { first_name: "Konjit",   last_name: "Kebede",     username: "konjit_k"   },
  { first_name: "Yared",    last_name: "Gebre",      username: "yared_g"    },
  { first_name: "Feven",    last_name: "Teshome",    username: "feven_t"    },
  { first_name: "Blen",     last_name: "Worku",      username: "blen_w"     },
  { first_name: "Haben",    last_name: "Fekadu",     username: "haben_f"    },
  { first_name: "Tewodros", last_name: "Solomon",    username: "tewodros_s" },
  { first_name: "Miriam",   last_name: "Hailu",      username: "miriam_h"   },
  { first_name: "Fitsum",   last_name: "Tesfaye",    username: "fitsum_t"   },
  { first_name: "Tigabu",   last_name: "Bekele",     username: "tigabu_b"   },
  { first_name: "Sosina",   last_name: "Tadesse",    username: "sosina_t"   },
  { first_name: "Ermias",   last_name: "Alemu",      username: "ermias_a"   },
  { first_name: "Hilina",   last_name: "Mengistu",   username: "hilina_m"   },
  { first_name: "Leul",     last_name: "Wolde",      username: "leul_w"     },
  { first_name: "Mekdes",   last_name: "Assefa",     username: "mekdes_a"   },
  { first_name: "Biniam",   last_name: "Girma",      username: "biniam_g"   },
  { first_name: "Hiwot",    last_name: "Kebede",     username: "hiwot_k"    },
  { first_name: "Nebiat",   last_name: "Gebre",      username: "nebiat_g"   },
  { first_name: "Kalkidan", last_name: "Teshome",    username: "kalkidan_t" },
  { first_name: "Yohannes", last_name: "Worku",      username: "yohannes_w" },
  { first_name: "Selamawit",last_name: "Fekadu",     username: "selamawit_f"},
  { first_name: "Girum",    last_name: "Solomon",    username: "girum_s"    },
  { first_name: "Nardos",   last_name: "Hailu",      username: "nardos_h"   },
  { first_name: "Yemane",    last_name: "Tesfaye",    username: "yemane_t"    },
  // ── 51–100 ──
  { first_name: "Kibrom",    last_name: "Tesfay",     username: "kibrom_t"    },
  { first_name: "Almaz",     last_name: "Haile",      username: "almaz_h"     },
  { first_name: "Tewolde",   last_name: "Gebru",      username: "tewolde_g"   },
  { first_name: "Meseret",   last_name: "Alemu",      username: "meseret_a"   },
  { first_name: "Habtom",    last_name: "Tekle",      username: "habtom_t"    },
  { first_name: "Silas",     last_name: "Desta",      username: "silas_d"     },
  { first_name: "Zewditu",   last_name: "Bekele",     username: "zewditu_b"   },
  { first_name: "Tamirat",   last_name: "Girma",      username: "tamirat_g"   },
  { first_name: "Haimanot",  last_name: "Wolde",      username: "haimanot_w"  },
  { first_name: "Tesfahun",  last_name: "Assefa",     username: "tesfahun_a"  },
  { first_name: "Birhan",    last_name: "Kebede",     username: "birhan_k"    },
  { first_name: "Elsa",      last_name: "Gebre",      username: "elsa_g"      },
  { first_name: "Adane",     last_name: "Teshome",    username: "adane_t"     },
  { first_name: "Senait",    last_name: "Worku",      username: "senait_w"    },
  { first_name: "Fikadu",    last_name: "Fekadu",     username: "fikadu_f"    },
  { first_name: "Tigst",     last_name: "Solomon",    username: "tigst_s"     },
  { first_name: "Mekonnen",  last_name: "Hailu",      username: "mekonnen_h"  },
  { first_name: "Mulu",      last_name: "Tesfaye",    username: "mulu_t"      },
  { first_name: "Tedros",    last_name: "Bekele",     username: "tedros_b"    },
  { first_name: "Yeshi",     last_name: "Tadesse",    username: "yeshi_t"     },
  { first_name: "Endale",    last_name: "Alemu",      username: "endale_a"    },
  { first_name: "Meskerem",  last_name: "Mengistu",   username: "meskerem_m"  },
  { first_name: "Berhane",   last_name: "Wolde",      username: "berhane_w"   },
  { first_name: "Aster",     last_name: "Assefa",     username: "aster_a"     },
  { first_name: "Tesfaye",   last_name: "Girma",      username: "tesfaye_g"   },
  { first_name: "Mihret",    last_name: "Kebede",     username: "mihret_k"    },
  { first_name: "Abiy",      last_name: "Gebre",      username: "abiy_g"      },
  { first_name: "Tigabu",    last_name: "Teshome",    username: "tigabu_t"    },
  { first_name: "Muluwork",  last_name: "Worku",      username: "muluwork_w"  },
  { first_name: "Zelalem",   last_name: "Fekadu",     username: "zelalem_f"   },
  { first_name: "Tizita",    last_name: "Solomon",    username: "tizita_s"    },
  { first_name: "Medhanie",  last_name: "Hailu",      username: "medhanie_h"  },
  { first_name: "Yordanos",  last_name: "Tesfaye",    username: "yordanos_t"  },
  { first_name: "Dawit",     last_name: "Bekele",     username: "dawit_b"     },
  { first_name: "Meklit",    last_name: "Tadesse",    username: "meklit_t"    },
  { first_name: "Abrham",    last_name: "Alemu",      username: "abrham_a"    },
  { first_name: "Hirut",     last_name: "Mengistu",   username: "hirut_m"     },
  { first_name: "Teshome",   last_name: "Wolde",      username: "teshome_w"   },
  { first_name: "Rahwa",     last_name: "Assefa",     username: "rahwa_a"     },
  { first_name: "Kebede",    last_name: "Girma",      username: "kebede_g"    },
  { first_name: "Tsehay",    last_name: "Kebede",     username: "tsehay_k"    },
  { first_name: "Wubet",     last_name: "Gebre",      username: "wubet_g"     },
  { first_name: "Eyerusalem",last_name: "Teshome",    username: "eyerusalem_t"},
  { first_name: "Milkias",   last_name: "Worku",      username: "milkias_w"   },
  { first_name: "Nigest",    last_name: "Fekadu",     username: "nigest_f"    },
  { first_name: "Gebre",     last_name: "Solomon",    username: "gebre_s"     },
  { first_name: "Fenan",     last_name: "Hailu",      username: "fenan_h"     },
  { first_name: "Aman",      last_name: "Tesfaye",    username: "aman_t"      },
  { first_name: "Semira",    last_name: "Bekele",     username: "semira_b"    },
  { first_name: "Yabsira",   last_name: "Tadesse",    username: "yabsira_t"   },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await anon.auth.getUser();
  if (!user || user.user_metadata?.telegram_id !== ADMIN_TELEGRAM_ID) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const created: string[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < GHOST_PROFILES.length; i++) {
    const p = GHOST_PROFILES[i];
    const email = `ghost_${i + 1}@nova-bingo.internal`;
    const telegramId = -(i + 1); // negative fake IDs never clash with real Telegram IDs

    // Idempotent: skip if already set up
    const { data: existing } = await admin
      .from("ghost_players")
      .select("id")
      .eq("username", p.username)
      .maybeSingle();

    if (existing) {
      skipped.push(p.username);
      continue;
    }

    // Create auth user
    const { data: userData, error: createError } = await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: {
        telegram_id: telegramId,
        first_name: p.first_name,
        last_name: p.last_name,
        username: p.username,
      },
    });

    if (createError || !userData?.user) {
      console.error(`Failed to create ghost ${p.username}:`, createError);
      continue;
    }

    const userId = userData.user.id;

    // Profile row
    await admin.from("profiles").upsert({
      id: userId,
      telegram_id: telegramId,
      first_name: p.first_name,
      last_name: p.last_name,
      username: p.username,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    // Fund wallet — play_balance is what gets staked
    await admin.from("wallets").upsert({
      user_id: userId,
      play_balance: 1_000_000,
      main_balance: 0,
    }, { onConflict: "user_id" });

    // Register in ghost_players pool
    await admin.from("ghost_players").insert({
      id: userId,
      name: `${p.first_name} ${p.last_name}`,
      username: p.username,
    });

    created.push(p.username);
  }

  return json({ success: true, created, skipped });
});

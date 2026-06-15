// Replace this file's contents by running:
//   npx supabase gen types typescript --project-id <your-project-id> > src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      admin_config: {
        Row: { id: number; rigged_mode: boolean; ghost_enabled: boolean; ghost_count: number };
        Insert: { id?: number; rigged_mode?: boolean; ghost_enabled?: boolean; ghost_count?: number };
        Update: { rigged_mode?: boolean; ghost_enabled?: boolean; ghost_count?: number };
        Relationships: [];
      };
      ghost_players: {
        Row: { id: string; name: string; username: string; created_at: string };
        Insert: { id: string; name: string; username: string };
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          telegram_id: number;
          username: string | null;
          first_name: string;
          last_name: string | null;
          photo_url: string | null;
          referral_code: string | null;
          referred_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          telegram_id: number;
          username?: string | null;
          first_name: string;
          last_name?: string | null;
          photo_url?: string | null;
          referral_code?: string | null;
          referred_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          telegram_id?: number;
          username?: string | null;
          first_name?: string;
          last_name?: string | null;
          photo_url?: string | null;
          referral_code?: string | null;
          referred_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallets: {
        Row: {
          id: string;
          user_id: string;
          main_balance: number;
          play_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          main_balance?: number;
          play_balance?: number;
        };
        Update: {
          main_balance?: number;
          play_balance?: number;
        };
        Relationships: [{ foreignKeyName: "wallets_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: "deposit" | "withdrawal" | "main_to_play" | "play_to_main" | "stake" | "prize" | "referral_bonus";
          amount: number;
          reference_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: "deposit" | "withdrawal" | "main_to_play" | "play_to_main" | "stake" | "prize" | "referral_bonus";
          amount: number;
          reference_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      referrals: {
        Row: {
          id: string;
          referrer_id: string;
          referee_id: string;
          bonus_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          referrer_id: string;
          referee_id: string;
          bonus_amount?: number;
        };
        Update: never;
        Relationships: [];
      };
      game_sessions: {
        Row: {
          id: string;
          stake_amount: number;
          status: "waiting" | "active" | "finished";
          timer_ends_at: string;
          ball_sequence: number[] | null;
          call_index: number;
          prize_pool: number;
          participant_count: number;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          stake_amount: number;
          status?: "waiting" | "active" | "finished";
          timer_ends_at: string;
          call_index?: number;
          prize_pool?: number;
          participant_count?: number;
        };
        Update: {
          status?: "waiting" | "active" | "finished";
          timer_ends_at?: string;
          call_index?: number;
          prize_pool?: number;
          participant_count?: number;
          started_at?: string | null;
          ended_at?: string | null;
        };
        Relationships: [];
      };
      cartela_reservations: {
        Row: {
          id: string;
          game_session_id: string;
          user_id: string;
          cartela_number: number;
          slot: 1 | 2;
          status: "reserved" | "confirmed" | "released";
          reserved_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          game_session_id: string;
          user_id: string;
          cartela_number: number;
          slot: 1 | 2;
          expires_at?: string;
        };
        Update: {
          status?: "reserved" | "confirmed" | "released";
        };
        Relationships: [];
      };
      game_participants: {
        Row: {
          id: string;
          game_session_id: string;
          user_id: string;
          cartela_1: number | null;
          cartela_2: number | null;
          is_watcher: boolean;
          stake_deducted: boolean;
          auto_mode: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_session_id: string;
          user_id: string;
          cartela_1?: number | null;
          cartela_2?: number | null;
          is_watcher?: boolean;
          stake_deducted?: boolean;
          auto_mode?: boolean;
        };
        Update: {
          auto_mode?: boolean;
          is_watcher?: boolean;
        };
        Relationships: [];
      };
      game_balls: {
        Row: {
          id: string;
          game_session_id: string;
          ball_number: number;
          sequence_index: number;
          called_at: string;
        };
        Insert: {
          id?: string;
          game_session_id: string;
          ball_number: number;
          sequence_index: number;
        };
        Update: never;
        Relationships: [];
      };
      game_results: {
        Row: {
          id: string;
          game_session_id: string;
          winner_id: string;
          cartela_id: number;
          pattern: string;
          prize_amount: number;
          balls_called_count: number;
          won_at: string;
        };
        Insert: {
          id?: string;
          game_session_id: string;
          winner_id: string;
          cartela_id: number;
          pattern: string;
          prize_amount: number;
          balls_called_count: number;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      start_game_session: {
        Args: { p_session_id: string };
        Returns: boolean;
      };
      process_winner: {
        Args: {
          p_session_id: string;
          p_user_id: string;
          p_cartela_id: number;
          p_pattern: string;
          p_prize: number;
          p_balls_called: number;
        };
        Returns: boolean;
      };
    };
    Enums: {
      transaction_type: "deposit" | "withdrawal" | "main_to_play" | "play_to_main" | "stake" | "prize" | "referral_bonus";
      game_status: "waiting" | "active" | "finished";
      reservation_status: "reserved" | "confirmed" | "released";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// ── Convenience row types ──────────────────────────────────────────────────────
export type Profile            = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert      = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate      = Database["public"]["Tables"]["profiles"]["Update"];
export type Wallet             = Database["public"]["Tables"]["wallets"]["Row"];
export type Transaction        = Database["public"]["Tables"]["transactions"]["Row"];
export type Referral           = Database["public"]["Tables"]["referrals"]["Row"];
export type GameSession        = Database["public"]["Tables"]["game_sessions"]["Row"];
export type CartelaReservation = Database["public"]["Tables"]["cartela_reservations"]["Row"];
export type GameParticipant    = Database["public"]["Tables"]["game_participants"]["Row"];
export type GameBall           = Database["public"]["Tables"]["game_balls"]["Row"];
export type GameResult         = Database["public"]["Tables"]["game_results"]["Row"];

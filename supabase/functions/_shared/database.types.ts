export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          notified_at: string | null
          source: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          notified_at?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          notified_at?: string | null
          source?: string
        }
        Relationships: []
      }
      auth_fail_attempts: {
        Row: {
          fail_count: number
          ip: string
          scope: string
          window_start: string
        }
        Insert: {
          fail_count?: number
          ip: string
          scope: string
          window_start?: string
        }
        Update: {
          fail_count?: number
          ip?: string
          scope?: string
          window_start?: string
        }
        Relationships: []
      }
      billing_customers: {
        Row: {
          cancel_at_period_end: boolean
          current_period_end: string | null
          last_event_at: string | null
          price_id: string | null
          stripe_customer_id: string
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          last_event_at?: string | null
          price_id?: string | null
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          last_event_at?: string | null
          price_id?: string | null
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_similarity: {
        Row: {
          computed_at: string
          media_type_a: string
          media_type_b: string
          score: number
          tmdb_id_a: number
          tmdb_id_b: number
        }
        Insert: {
          computed_at?: string
          media_type_a: string
          media_type_b: string
          score: number
          tmdb_id_a: number
          tmdb_id_b: number
        }
        Update: {
          computed_at?: string
          media_type_a?: string
          media_type_b?: string
          score?: number
          tmdb_id_a?: number
          tmdb_id_b?: number
        }
        Relationships: []
      }
      critic_scores: {
        Row: {
          critic_score: number | null
          fetched_at: string
          imdb_id: string
          source: string | null
        }
        Insert: {
          critic_score?: number | null
          fetched_at?: string
          imdb_id: string
          source?: string | null
        }
        Update: {
          critic_score?: number | null
          fetched_at?: string
          imdb_id?: string
          source?: string | null
        }
        Relationships: []
      }
      feed_posts: {
        Row: {
          author_id: string
          created_at: string
          id: string
          media_type: string | null
          note: string | null
          poster_path: string | null
          rank: number | null
          rating: number | null
          source_type: string
          title: string | null
          tmdb_id: number | null
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          media_type?: string | null
          note?: string | null
          poster_path?: string | null
          rank?: number | null
          rating?: number | null
          source_type?: string
          title?: string | null
          tmdb_id?: number | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          media_type?: string | null
          note?: string | null
          poster_path?: string | null
          rank?: number | null
          rating?: number | null
          source_type?: string
          title?: string | null
          tmdb_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          attachments: string[] | null
          created_at: string
          id: string
          linear_issue_id: string | null
          linear_issue_url: string | null
          linear_sync_error: string | null
          linear_synced_at: string | null
          message: string
          type: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          attachments?: string[] | null
          created_at?: string
          id?: string
          linear_issue_id?: string | null
          linear_issue_url?: string | null
          linear_sync_error?: string | null
          linear_synced_at?: string | null
          message: string
          type: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          attachments?: string[] | null
          created_at?: string
          id?: string
          linear_issue_id?: string | null
          linear_issue_url?: string | null
          linear_sync_error?: string | null
          linear_synced_at?: string | null
          message?: string
          type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          status: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          status?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          status?: string
        }
        Relationships: []
      }
      history: {
        Row: {
          created_at: string | null
          dnf: boolean
          genre_ids: number[] | null
          id: number
          media_type: string
          mood: string | null
          note: string | null
          poster_path: string | null
          rating: number | null
          release_date: string | null
          title: string
          tmdb_id: number
          updatedAt: string | null
          user_id: string
          watched_at: string | null
          watchStatus: string | null
        }
        Insert: {
          created_at?: string | null
          dnf?: boolean
          genre_ids?: number[] | null
          id?: number
          media_type: string
          mood?: string | null
          note?: string | null
          poster_path?: string | null
          rating?: number | null
          release_date?: string | null
          title: string
          tmdb_id: number
          updatedAt?: string | null
          user_id: string
          watched_at?: string | null
          watchStatus?: string | null
        }
        Update: {
          created_at?: string | null
          dnf?: boolean
          genre_ids?: number[] | null
          id?: number
          media_type?: string
          mood?: string | null
          note?: string | null
          poster_path?: string | null
          rating?: number | null
          release_date?: string | null
          title?: string
          tmdb_id?: number
          updatedAt?: string | null
          user_id?: string
          watched_at?: string | null
          watchStatus?: string | null
        }
        Relationships: []
      }
      integration_items: {
        Row: {
          availability: Json
          created_at: string
          external_guid: string | null
          external_id: string
          id: string
          integration_id: string | null
          last_seen_at: string | null
          match_state: string
          media_type: string | null
          poster_path: string | null
          raw: Json
          release_date: string | null
          source: string
          sync_state: string
          title: string | null
          tmdb_id: number | null
          updated_at: string
          user_id: string
          watched_at: string | null
        }
        Insert: {
          availability?: Json
          created_at?: string
          external_guid?: string | null
          external_id: string
          id?: string
          integration_id?: string | null
          last_seen_at?: string | null
          match_state?: string
          media_type?: string | null
          poster_path?: string | null
          raw?: Json
          release_date?: string | null
          source: string
          sync_state?: string
          title?: string | null
          tmdb_id?: number | null
          updated_at?: string
          user_id: string
          watched_at?: string | null
        }
        Update: {
          availability?: Json
          created_at?: string
          external_guid?: string | null
          external_id?: string
          id?: string
          integration_id?: string | null
          last_seen_at?: string | null
          match_state?: string
          media_type?: string | null
          poster_path?: string | null
          raw?: Json
          release_date?: string | null
          source?: string
          sync_state?: string
          title?: string | null
          tmdb_id?: number | null
          updated_at?: string
          user_id?: string
          watched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_items_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "media_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_outbox: {
        Row: {
          action: string
          attempts: number
          created_at: string
          id: string
          integration_id: string | null
          last_error: string | null
          payload: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          attempts?: number
          created_at?: string
          id?: string
          integration_id?: string | null
          last_error?: string | null
          payload?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          attempts?: number
          created_at?: string
          id?: string
          integration_id?: string | null
          last_error?: string | null
          payload?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_outbox_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "media_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      kofi_supporters: {
        Row: {
          amount: number | null
          currency: string | null
          email: string | null
          from_name: string | null
          is_first_subscription_payment: boolean
          is_public: boolean
          is_subscription_payment: boolean
          kofi_timestamp: string | null
          kofi_transaction_id: string
          message: string | null
          message_id: string | null
          received_at: string
          tier_name: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          currency?: string | null
          email?: string | null
          from_name?: string | null
          is_first_subscription_payment?: boolean
          is_public?: boolean
          is_subscription_payment?: boolean
          kofi_timestamp?: string | null
          kofi_transaction_id: string
          message?: string | null
          message_id?: string | null
          received_at?: string
          tier_name?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          currency?: string | null
          email?: string | null
          from_name?: string | null
          is_first_subscription_payment?: boolean
          is_public?: boolean
          is_subscription_payment?: boolean
          kofi_timestamp?: string | null
          kofi_transaction_id?: string
          message?: string | null
          message_id?: string | null
          received_at?: string
          tier_name?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      list_items: {
        Row: {
          created_at: string | null
          genre_ids: number[]
          id: string
          list_id: string
          media_type: string
          poster_path: string | null
          provider_ids: number[]
          release_date: string | null
          streaming_date: string | null
          title: string | null
          tmdb_id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          genre_ids?: number[]
          id?: string
          list_id: string
          media_type: string
          poster_path?: string | null
          provider_ids?: number[]
          release_date?: string | null
          streaming_date?: string | null
          title?: string | null
          tmdb_id: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          genre_ids?: number[]
          id?: string
          list_id?: string
          media_type?: string
          poster_path?: string | null
          provider_ids?: number[]
          release_date?: string | null
          streaming_date?: string | null
          title?: string | null
          tmdb_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string | null
          id: string
          is_public: boolean | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      marketing_batch_runs: {
        Row: {
          counts: Json
          error: string | null
          finished_at: string | null
          id: string
          run_type: string
          started_at: string
          status: string
        }
        Insert: {
          counts?: Json
          error?: string | null
          finished_at?: string | null
          id?: string
          run_type: string
          started_at?: string
          status?: string
        }
        Update: {
          counts?: Json
          error?: string | null
          finished_at?: string | null
          id?: string
          run_type?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      marketing_metrics: {
        Row: {
          collected_at: string
          id: number
          likes: number | null
          link_clicks: number | null
          metric_date: string
          publication_id: string
          raw: Json
          replies: number | null
          reposts: number | null
          saves: number | null
          views: number | null
        }
        Insert: {
          collected_at?: string
          id?: never
          likes?: number | null
          link_clicks?: number | null
          metric_date: string
          publication_id: string
          raw?: Json
          replies?: number | null
          reposts?: number | null
          saves?: number | null
          views?: number | null
        }
        Update: {
          collected_at?: string
          id?: never
          likes?: number | null
          link_clicks?: number | null
          metric_date?: string
          publication_id?: string
          raw?: Json
          replies?: number | null
          reposts?: number | null
          saves?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_metrics_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "marketing_post_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_newsletter_issues: {
        Row: {
          created_at: string
          html: string
          id: string
          issue_date: string
          recipient_count: number
          sent_at: string
          snapshot: Json
          subject: string
          week_start: string
        }
        Insert: {
          created_at?: string
          html: string
          id?: string
          issue_date: string
          recipient_count?: number
          sent_at: string
          snapshot?: Json
          subject: string
          week_start: string
        }
        Update: {
          created_at?: string
          html?: string
          id?: string
          issue_date?: string
          recipient_count?: number
          sent_at?: string
          snapshot?: Json
          subject?: string
          week_start?: string
        }
        Relationships: []
      }
      marketing_post_publications: {
        Row: {
          attempt_count: number
          error: string | null
          id: string
          permalink: string | null
          platform: string
          platform_post_id: string | null
          post_id: string
          published_at: string | null
          sent_payload: Json | null
          sent_text: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          error?: string | null
          id?: string
          permalink?: string | null
          platform: string
          platform_post_id?: string | null
          post_id: string
          published_at?: string | null
          sent_payload?: Json | null
          sent_text?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          error?: string | null
          id?: string
          permalink?: string | null
          platform?: string
          platform_post_id?: string | null
          post_id?: string
          published_at?: string | null
          sent_payload?: Json | null
          sent_text?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_post_publications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "marketing_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_posts: {
        Row: {
          copy: Json | null
          created_at: string
          digest_sent_at: string | null
          error: string | null
          generated_copy: Json | null
          id: string
          media: Json | null
          payload: Json
          post_type: string
          scheduled_for: string
          slug: string | null
          status: string
          tmdb_refs: Json
          topic_key: string
          updated_at: string
          veto_expires_at: string | null
          veto_token: string
          vetoed_at: string | null
        }
        Insert: {
          copy?: Json | null
          created_at?: string
          digest_sent_at?: string | null
          error?: string | null
          generated_copy?: Json | null
          id?: string
          media?: Json | null
          payload?: Json
          post_type: string
          scheduled_for: string
          slug?: string | null
          status?: string
          tmdb_refs?: Json
          topic_key: string
          updated_at?: string
          veto_expires_at?: string | null
          veto_token?: string
          vetoed_at?: string | null
        }
        Update: {
          copy?: Json | null
          created_at?: string
          digest_sent_at?: string | null
          error?: string | null
          generated_copy?: Json | null
          id?: string
          media?: Json | null
          payload?: Json
          post_type?: string
          scheduled_for?: string
          slug?: string | null
          status?: string
          tmdb_refs?: Json
          topic_key?: string
          updated_at?: string
          veto_expires_at?: string | null
          veto_token?: string
          vetoed_at?: string | null
        }
        Relationships: []
      }
      marketing_review_events: {
        Row: {
          action: string
          actor: string
          after: Json | null
          before: Json | null
          id: string
          occurred_at: string
          post_id: string | null
        }
        Insert: {
          action: string
          actor: string
          after?: Json | null
          before?: Json | null
          id?: string
          occurred_at?: string
          post_id?: string | null
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          before?: Json | null
          id?: string
          occurred_at?: string
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_review_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "marketing_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_settings: {
        Row: {
          id: number
          publishing_paused: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          publishing_paused?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          publishing_paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      marketing_subscribers: {
        Row: {
          consented_at: string | null
          created_at: string
          email: string
          id: string
          source: string
          status: string
          unsubscribe_token: string
          unsubscribed_at: string | null
          user_id: string | null
        }
        Insert: {
          consented_at?: string | null
          created_at?: string
          email: string
          id?: string
          source?: string
          status?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          user_id?: string | null
        }
        Update: {
          consented_at?: string | null
          created_at?: string
          email?: string
          id?: string
          source?: string
          status?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      marketing_tokens: {
        Row: {
          access_token: string
          account_id: string
          expires_at: string
          platform: string
          refreshed_at: string
        }
        Insert: {
          access_token: string
          account_id: string
          expires_at: string
          platform: string
          refreshed_at?: string
        }
        Update: {
          access_token?: string
          account_id?: string
          expires_at?: string
          platform?: string
          refreshed_at?: string
        }
        Relationships: []
      }
      marketing_tracked_titles: {
        Row: {
          announced: Json
          digital_date: string | null
          first_seen_at: string
          id: string
          known_trailers: Json
          media_type: string
          popularity: number | null
          release_date: string | null
          title: string
          tmdb_id: number
          updated_at: string
        }
        Insert: {
          announced?: Json
          digital_date?: string | null
          first_seen_at?: string
          id?: string
          known_trailers?: Json
          media_type: string
          popularity?: number | null
          release_date?: string | null
          title: string
          tmdb_id: number
          updated_at?: string
        }
        Update: {
          announced?: Json
          digital_date?: string | null
          first_seen_at?: string
          id?: string
          known_trailers?: Json
          media_type?: string
          popularity?: number | null
          release_date?: string | null
          title?: string
          tmdb_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      marketing_trending_snapshots: {
        Row: {
          items: Json
          snapshot_date: string
        }
        Insert: {
          items: Json
          snapshot_date: string
        }
        Update: {
          items?: Json
          snapshot_date?: string
        }
        Relationships: []
      }
      media_integrations: {
        Row: {
          auth_expires_at: string | null
          auth_pin_code: string | null
          auth_pin_id: string | null
          created_at: string
          device_token_hash: string | null
          display_name: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          plex_account: Json
          plex_servers: Json
          plex_token_ciphertext: string | null
          plex_token_iv: string | null
          provider: string
          selected_server: Json | null
          status: string
          trakt_redirect_uri: string | null
          trakt_refresh_ciphertext: string | null
          trakt_refresh_iv: string | null
          trakt_token_ciphertext: string | null
          trakt_token_expires_at: string | null
          trakt_token_iv: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_expires_at?: string | null
          auth_pin_code?: string | null
          auth_pin_id?: string | null
          created_at?: string
          device_token_hash?: string | null
          display_name?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          plex_account?: Json
          plex_servers?: Json
          plex_token_ciphertext?: string | null
          plex_token_iv?: string | null
          provider: string
          selected_server?: Json | null
          status?: string
          trakt_redirect_uri?: string | null
          trakt_refresh_ciphertext?: string | null
          trakt_refresh_iv?: string | null
          trakt_token_ciphertext?: string | null
          trakt_token_expires_at?: string | null
          trakt_token_iv?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_expires_at?: string | null
          auth_pin_code?: string | null
          auth_pin_id?: string | null
          created_at?: string
          device_token_hash?: string | null
          display_name?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          plex_account?: Json
          plex_servers?: Json
          plex_token_ciphertext?: string | null
          plex_token_iv?: string | null
          provider?: string
          selected_server?: Json | null
          status?: string
          trakt_redirect_uri?: string | null
          trakt_refresh_ciphertext?: string | null
          trakt_refresh_iv?: string | null
          trakt_token_ciphertext?: string | null
          trakt_token_expires_at?: string | null
          trakt_token_iv?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          post_id: string | null
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          post_id?: string | null
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          post_id?: string | null
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_approval_decisions: {
        Row: {
          actor: string | null
          created_at: string
          decision: string
          id: string
          note: string | null
          post_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          decision: string
          id?: string
          note?: string | null
          post_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          decision?: string
          id?: string
          note?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_approval_decisions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "operator_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_channel_accounts: {
        Row: {
          created_at: string
          external_channel_id: string | null
          id: string
          is_active: boolean
          label: string
          platform: string
          service: string
        }
        Insert: {
          created_at?: string
          external_channel_id?: string | null
          id?: string
          is_active?: boolean
          label: string
          platform: string
          service: string
        }
        Update: {
          created_at?: string
          external_channel_id?: string | null
          id?: string
          is_active?: boolean
          label?: string
          platform?: string
          service?: string
        }
        Relationships: []
      }
      operator_post_channel_variants: {
        Row: {
          attempt_count: number
          created_at: string
          enabled: boolean
          first_comment: string | null
          id: string
          last_error: string | null
          permalink: string | null
          platform: string
          platform_post_id: string | null
          post_id: string
          published_at: string | null
          scheduled_for: string | null
          sent_payload: Json | null
          status: string
          text_override: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          enabled?: boolean
          first_comment?: string | null
          id?: string
          last_error?: string | null
          permalink?: string | null
          platform: string
          platform_post_id?: string | null
          post_id: string
          published_at?: string | null
          scheduled_for?: string | null
          sent_payload?: Json | null
          status?: string
          text_override?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          enabled?: boolean
          first_comment?: string | null
          id?: string
          last_error?: string | null
          permalink?: string | null
          platform?: string
          platform_post_id?: string | null
          post_id?: string
          published_at?: string | null
          scheduled_for?: string | null
          sent_payload?: Json | null
          status?: string
          text_override?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_post_channel_variants_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "operator_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_post_media: {
        Row: {
          channels: Json
          created_at: string
          id: string
          landscape_path: string | null
          portrait_path: string | null
          post_id: string
          sort_order: number
        }
        Insert: {
          channels?: Json
          created_at?: string
          id?: string
          landscape_path?: string | null
          portrait_path?: string | null
          post_id: string
          sort_order?: number
        }
        Update: {
          channels?: Json
          created_at?: string
          id?: string
          landscape_path?: string | null
          portrait_path?: string | null
          post_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "operator_post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "operator_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_post_notes: {
        Row: {
          actor: string | null
          body: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          actor?: string | null
          body: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          actor?: string | null
          body?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_post_notes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "operator_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_posts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: Json
          created_at: string
          created_by: string | null
          id: string
          legacy_post_type: string
          payload: Json
          rejected_at: string | null
          rejected_by: string | null
          scheduled_for: string | null
          source: string
          state: string
          tmdb_refs: Json
          topic_key: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_post_type?: string
          payload?: Json
          rejected_at?: string | null
          rejected_by?: string | null
          scheduled_for?: string | null
          source: string
          state?: string
          tmdb_refs?: Json
          topic_key?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_post_type?: string
          payload?: Json
          rejected_at?: string | null
          rejected_by?: string | null
          scheduled_for?: string | null
          source?: string
          state?: string
          tmdb_refs?: Json
          topic_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      operator_publish_attempts: {
        Row: {
          created_at: string
          error: string | null
          id: string
          platform: string
          post_id: string
          response_payload: Json | null
          sent_payload: Json | null
          sent_text: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          platform: string
          post_id: string
          response_payload?: Json | null
          sent_payload?: Json | null
          sent_text?: string | null
          status: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          platform?: string
          post_id?: string
          response_payload?: Json | null
          sent_payload?: Json | null
          sent_text?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_publish_attempts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "operator_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_sync_links: {
        Row: {
          created_at: string
          external_id: string
          id: string
          legacy_post_id: string | null
          post_id: string
          source_system: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          legacy_post_id?: string | null
          post_id: string
          source_system: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          legacy_post_id?: string | null
          post_id?: string
          source_system?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_sync_links_legacy_post_id_fkey"
            columns: ["legacy_post_id"]
            isOneToOne: false
            referencedRelation: "marketing_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_sync_links_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "operator_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_charts: {
        Row: {
          cumulative_weeks: number | null
          id: string
          match_state: string
          media_type: string
          platform: string
          poster_path: string | null
          rank: number
          region: string
          title: string
          tmdb_id: number | null
          tmdb_title: string | null
          updated_at: string
          week: string
        }
        Insert: {
          cumulative_weeks?: number | null
          id?: string
          match_state?: string
          media_type: string
          platform: string
          poster_path?: string | null
          rank: number
          region: string
          title: string
          tmdb_id?: number | null
          tmdb_title?: string | null
          updated_at?: string
          week: string
        }
        Update: {
          cumulative_weeks?: number | null
          id?: string
          match_state?: string
          media_type?: string
          platform?: string
          poster_path?: string | null
          rank?: number
          region?: string
          title?: string
          tmdb_id?: number | null
          tmdb_title?: string | null
          updated_at?: string
          week?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          calendar_token: string | null
          digest_prompt_dismissed_at: string | null
          display_name: string | null
          first_name: string | null
          genres: string[] | null
          guide_channels: Json | null
          id: string
          include_kids_content: boolean
          is_premium: boolean | null
          is_public: boolean | null
          is_supporter: boolean
          last_kofi_tip_at: string | null
          links: Json | null
          marketing_emails: boolean
          onboarding_complete: boolean | null
          profile_sections: string[] | null
          region: string | null
          streaming_providers: Json | null
          timezone: string | null
          username: string | null
          watchlist_availability_alerts: boolean
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          calendar_token?: string | null
          digest_prompt_dismissed_at?: string | null
          display_name?: string | null
          first_name?: string | null
          genres?: string[] | null
          guide_channels?: Json | null
          id: string
          include_kids_content?: boolean
          is_premium?: boolean | null
          is_public?: boolean | null
          is_supporter?: boolean
          last_kofi_tip_at?: string | null
          links?: Json | null
          marketing_emails?: boolean
          onboarding_complete?: boolean | null
          profile_sections?: string[] | null
          region?: string | null
          streaming_providers?: Json | null
          timezone?: string | null
          username?: string | null
          watchlist_availability_alerts?: boolean
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          calendar_token?: string | null
          digest_prompt_dismissed_at?: string | null
          display_name?: string | null
          first_name?: string | null
          genres?: string[] | null
          guide_channels?: Json | null
          id?: string
          include_kids_content?: boolean
          is_premium?: boolean | null
          is_public?: boolean | null
          is_supporter?: boolean
          last_kofi_tip_at?: string | null
          links?: Json | null
          marketing_emails?: boolean
          onboarding_complete?: boolean | null
          profile_sections?: string[] | null
          region?: string | null
          streaming_providers?: Json | null
          timezone?: string | null
          username?: string | null
          watchlist_availability_alerts?: boolean
        }
        Relationships: []
      }
      reminders: {
        Row: {
          air_date: string
          air_time: string | null
          created_at: string | null
          id: string
          network_name: string | null
          runtime: number | null
          show_name: string
          tvmaze_ep_id: number
          user_id: string
        }
        Insert: {
          air_date: string
          air_time?: string | null
          created_at?: string | null
          id?: string
          network_name?: string | null
          runtime?: number | null
          show_name: string
          tvmaze_ep_id: number
          user_id: string
        }
        Update: {
          air_date?: string
          air_time?: string | null
          created_at?: string | null
          id?: string
          network_name?: string | null
          runtime?: number | null
          show_name?: string
          tvmaze_ep_id?: number
          user_id?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          received_at: string
          type: string
        }
        Insert: {
          id: string
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      title_similarity: {
        Row: {
          media_type_a: string
          media_type_b: string
          score: number
          tmdb_id_a: number
          tmdb_id_b: number
          updated_at: string
        }
        Insert: {
          media_type_a: string
          media_type_b: string
          score: number
          tmdb_id_a: number
          tmdb_id_b: number
          updated_at?: string
        }
        Update: {
          media_type_a?: string
          media_type_b?: string
          score?: number
          tmdb_id_a?: number
          tmdb_id_b?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_custom_list_items: {
        Row: {
          added_at: string | null
          id: string
          list_id: string
          media_type: string
          poster_path: string | null
          title: string
          tmdb_id: number
          user_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          list_id: string
          media_type: string
          poster_path?: string | null
          title: string
          tmdb_id: number
          user_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          list_id?: string
          media_type?: string
          poster_path?: string | null
          title?: string
          tmdb_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "user_custom_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      user_custom_lists: {
        Row: {
          created_at: string | null
          id: string
          is_public: boolean
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_public?: boolean
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_public?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_favourites: {
        Row: {
          created_at: string | null
          id: string
          media_type: string
          poster_path: string | null
          title: string
          tmdb_id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          media_type: string
          poster_path?: string | null
          title: string
          tmdb_id: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          media_type?: string
          poster_path?: string | null
          title?: string
          tmdb_id?: number
          user_id?: string
        }
        Relationships: []
      }
      user_top_lists: {
        Row: {
          created_at: string | null
          id: string
          list_type: string
          media_type: string
          poster_path: string | null
          rank: number
          title: string
          tmdb_id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          list_type: string
          media_type: string
          poster_path?: string | null
          rank: number
          title: string
          tmdb_id: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          list_type?: string
          media_type?: string
          poster_path?: string | null
          rank?: number
          title?: string
          tmdb_id?: number
          user_id?: string
        }
        Relationships: []
      }
      watching_progress: {
        Row: {
          current_episode: number
          current_season: number
          id: string
          poster_path: string | null
          started_at: string
          title: string
          tmdb_id: number
          total_episodes: number | null
          total_seasons: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          current_episode?: number
          current_season?: number
          id?: string
          poster_path?: string | null
          started_at?: string
          title: string
          tmdb_id: number
          total_episodes?: number | null
          total_seasons?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          current_episode?: number
          current_season?: number
          id?: string
          poster_path?: string | null
          started_at?: string
          title?: string
          tmdb_id?: number
          total_episodes?: number | null
          total_seasons?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist_availability_alerts: {
        Row: {
          id: string
          media_type: string
          notified_at: string
          provider_id: number
          provider_name: string
          region: string
          title: string
          tmdb_id: number
          user_id: string
        }
        Insert: {
          id?: string
          media_type: string
          notified_at?: string
          provider_id: number
          provider_name: string
          region: string
          title: string
          tmdb_id: number
          user_id: string
        }
        Update: {
          id?: string
          media_type?: string
          notified_at?: string
          provider_id?: number
          provider_name?: string
          region?: string
          title?: string
          tmdb_id?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      marketing_template_stats: {
        Row: {
          avg_engagement_rate: number | null
          avg_views: number | null
          cta_variant: string | null
          post_type: string | null
          posts: number | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
          is_premium: boolean | null
          is_supporter: boolean | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
          is_premium?: boolean | null
          is_supporter?: boolean | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
          is_premium?: boolean | null
          is_supporter?: boolean | null
          username?: string | null
        }
        Relationships: []
      }
      user_title_signals: {
        Row: {
          genre_ids: number[] | null
          media_type: string | null
          tmdb_id: number | null
          user_id: string | null
          weight: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      auth_note_fail: {
        Args: { p_ip: string; p_scope: string; p_window_ms: number }
        Returns: number
      }
      can_create_custom_list: { Args: never; Returns: boolean }
      for_you_content_similarity_gaps: {
        Args: { p_limit?: number }
        Returns: {
          media_type: string
          tmdb_id: number
        }[]
      }
      generate_username: { Args: { p_seed: string }; Returns: string }
      get_for_you: {
        Args: { p_limit?: number }
        Returns: {
          media_type: string
          reason: string
          relevance: number
          tmdb_id: number
        }[]
      }
      get_profile_card: {
        Args: { p_username: string }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          follow_status: string
          id: string
          is_premium: boolean
          is_public: boolean
          is_supporter: boolean
          links: Json
          profile_sections: string[]
          username: string
        }[]
      }
      is_accepted_follower: { Args: { p_target: string }; Returns: boolean }
      is_premium: { Args: { p_user?: string }; Returns: boolean }
      is_profile_public: { Args: { p_uid: string }; Returns: boolean }
      list_follow_requests: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          follower_id: string
          requested_at: string
          username: string
        }[]
      }
      list_followers: {
        Args: { p_target: string }
        Returns: {
          avatar_url: string
          display_name: string
          follow_status: string
          id: string
          is_premium: boolean
          is_public: boolean
          is_supporter: boolean
          username: string
        }[]
      }
      list_following: {
        Args: { p_target: string }
        Returns: {
          avatar_url: string
          display_name: string
          follow_status: string
          id: string
          is_premium: boolean
          is_public: boolean
          is_supporter: boolean
          username: string
        }[]
      }
      list_notifications: {
        Args: never
        Returns: {
          actor_avatar_url: string
          actor_display_name: string
          actor_id: string
          actor_username: string
          created_at: string
          id: string
          post_id: string
          post_poster_path: string
          post_title: string
          read_at: string
          type: string
        }[]
      }
      marketing_recipient_list: {
        Args: never
        Returns: {
          email: string
          unsubscribe_token: string
        }[]
      }
      recompute_title_similarity: { Args: never; Returns: undefined }
      record_kofi_tip: { Args: { p_payload: Json }; Returns: Json }
      search_users: {
        Args: { p_query: string }
        Returns: {
          avatar_url: string
          display_name: string
          follow_status: string
          id: string
          is_premium: boolean
          is_public: boolean
          is_supporter: boolean
          username: string
        }[]
      }
      suggested_users: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          follow_status: string
          id: string
          is_premium: boolean
          is_public: boolean
          is_supporter: boolean
          post_count: number
          username: string
        }[]
      }
      swap_top_list_ranks: {
        Args: {
          p_list_type: string
          p_rank_a: number
          p_rank_b: number
          p_user_id: string
        }
        Returns: undefined
      }
      username_available: { Args: { p_username: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

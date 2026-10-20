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
      alert_job_runs: {
        Row: {
          finished_at: string | null
          id: number
          job: string
          ok: boolean | null
          started_at: string
          stats: Json
        }
        Insert: {
          finished_at?: string | null
          id?: never
          job: string
          ok?: boolean | null
          started_at?: string
          stats?: Json
        }
        Update: {
          finished_at?: string | null
          id?: never
          job?: string
          ok?: boolean | null
          started_at?: string
          stats?: Json
        }
        Relationships: []
      }
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
      availability_events: {
        Row: {
          bucket: string
          confirmed_at: string
          first_seen_at: string
          provider_id: number
          provider_name: string
          region: string
          tmdb_id: number
        }
        Insert: {
          bucket: string
          confirmed_at?: string
          first_seen_at: string
          provider_id: number
          provider_name: string
          region: string
          tmdb_id: number
        }
        Update: {
          bucket?: string
          confirmed_at?: string
          first_seen_at?: string
          provider_id?: number
          provider_name?: string
          region?: string
          tmdb_id?: number
        }
        Relationships: []
      }
      billing_checkout_attempts: {
        Row: {
          lease_token: string | null
          lease_until: string | null
          managed_payments: boolean
          operation_id: string
          price_id: string
          session_id: string | null
          settings_url: string
          started_at: string
          user_id: string
        }
        Insert: {
          lease_token?: string | null
          lease_until?: string | null
          managed_payments?: boolean
          operation_id?: string
          price_id: string
          session_id?: string | null
          settings_url: string
          started_at?: string
          user_id: string
        }
        Update: {
          lease_token?: string | null
          lease_until?: string | null
          managed_payments?: boolean
          operation_id?: string
          price_id?: string
          session_id?: string | null
          settings_url?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_customers: {
        Row: {
          cancel_at_period_end: boolean
          current_period_end: string | null
          last_event_at: string | null
          past_due_since: string | null
          price_id: string | null
          revision: number
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
          past_due_since?: string | null
          price_id?: string | null
          revision?: number
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
          past_due_since?: string | null
          price_id?: string | null
          revision?: number
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      broadcast_preferences: {
        Row: {
          channel_ids: string[] | null
          market_id: string
          user_id: string
        }
        Insert: {
          channel_ids?: string[] | null
          market_id: string
          user_id: string
        }
        Update: {
          channel_ids?: string[] | null
          market_id?: string
          user_id?: string
        }
        Relationships: []
      }
      critic_score_request_quota: {
        Row: {
          bucket: string
          request_count: number
          window_start: string
        }
        Insert: {
          bucket: string
          request_count?: number
          window_start?: string
        }
        Update: {
          bucket?: string
          request_count?: number
          window_start?: string
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
      episode_alert_mutes: {
        Row: {
          created_at: string
          tmdb_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          tmdb_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          tmdb_id?: number
          user_id?: string
        }
        Relationships: []
      }
      episode_watch_overrides: {
        Row: {
          episode_number: number
          id: string
          season_number: number
          tmdb_id: number
          updated_at: string
          user_id: string
          watched: boolean
        }
        Insert: {
          episode_number: number
          id?: string
          season_number: number
          tmdb_id: number
          updated_at?: string
          user_id: string
          watched: boolean
        }
        Update: {
          episode_number?: number
          id?: string
          season_number?: number
          tmdb_id?: number
          updated_at?: string
          user_id?: string
          watched?: boolean
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
          github_issue_number: number | null
          github_issue_url: string | null
          github_sync_error: string | null
          github_synced_at: string | null
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
          github_issue_number?: number | null
          github_issue_url?: string | null
          github_sync_error?: string | null
          github_synced_at?: string | null
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
          github_issue_number?: number | null
          github_issue_url?: string | null
          github_sync_error?: string | null
          github_synced_at?: string | null
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
      imported_annotations: {
        Row: {
          annotation: Json
          annotation_scope: string
          episode_number: number | null
          external_ids: Json
          id: string
          imported_at: string
          media_type: string
          season_number: number | null
          source: string
          source_key: string
          tmdb_id: number
          user_id: string
        }
        Insert: {
          annotation: Json
          annotation_scope: string
          episode_number?: number | null
          external_ids?: Json
          id?: string
          imported_at?: string
          media_type: string
          season_number?: number | null
          source: string
          source_key: string
          tmdb_id: number
          user_id: string
        }
        Update: {
          annotation?: Json
          annotation_scope?: string
          episode_number?: number | null
          external_ids?: Json
          id?: string
          imported_at?: string
          media_type?: string
          season_number?: number | null
          source?: string
          source_key?: string
          tmdb_id?: number
          user_id?: string
        }
        Relationships: []
      }
      imported_list_entries: {
        Row: {
          id: string
          payload: Json
          source_key: string
          user_id: string
        }
        Insert: {
          id?: string
          payload: Json
          source_key: string
          user_id: string
        }
        Update: {
          id?: string
          payload?: Json
          source_key?: string
          user_id?: string
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          attempts: number
          available_at: string
          checkpoint: Json
          created_at: string
          duplicates: number
          entry: string
          failed: number
          files: string[]
          finished_at: string | null
          id: string
          imported: number
          kind: string
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          phase: string
          progress_done: number
          progress_total: number
          review_count: number
          seen_at: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          checkpoint?: Json
          created_at?: string
          duplicates?: number
          entry?: string
          failed?: number
          files?: string[]
          finished_at?: string | null
          id?: string
          imported?: number
          kind: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          phase?: string
          progress_done?: number
          progress_total?: number
          review_count?: number
          seen_at?: string | null
          source: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          checkpoint?: Json
          created_at?: string
          duplicates?: number
          entry?: string
          failed?: number
          files?: string[]
          finished_at?: string | null
          id?: string
          imported?: number
          kind?: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          phase?: string
          progress_done?: number
          progress_total?: number
          review_count?: number
          seen_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      imported_lists: {
        Row: {
          id: string
          list_id: string | null
          metadata: Json
          source_key: string
          user_id: string
        }
        Insert: {
          id?: string
          list_id?: string | null
          metadata: Json
          source_key: string
          user_id: string
        }
        Update: {
          id?: string
          list_id?: string | null
          metadata?: Json
          source_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_lists_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "user_custom_lists"
            referencedColumns: ["id"]
          },
        ]
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
      marketing_linear_mirror_lease: {
        Row: {
          lease_until: string
          owner: string
          singleton: boolean
        }
        Insert: {
          lease_until: string
          owner: string
          singleton?: boolean
        }
        Update: {
          lease_until?: string
          owner?: string
          singleton?: boolean
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
      marketing_notion_mirror_lease: {
        Row: {
          lease_until: string
          owner: string
          singleton: boolean
        }
        Insert: {
          lease_until: string
          owner: string
          singleton?: boolean
        }
        Update: {
          lease_until?: string
          owner?: string
          singleton?: boolean
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
          linear_issue_id: string | null
          linear_issue_url: string | null
          linear_sync_error: string | null
          linear_synced_at: string | null
          media: Json | null
          notion_body_hash: string | null
          notion_handled_comment_ids: Json
          notion_observed_date: string | null
          notion_observed_status: string | null
          notion_page_id: string | null
          notion_page_url: string | null
          notion_remote_edited_at: string | null
          notion_sync_error: string | null
          notion_synced_at: string | null
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
          linear_issue_id?: string | null
          linear_issue_url?: string | null
          linear_sync_error?: string | null
          linear_synced_at?: string | null
          media?: Json | null
          notion_body_hash?: string | null
          notion_handled_comment_ids?: Json
          notion_observed_date?: string | null
          notion_observed_status?: string | null
          notion_page_id?: string | null
          notion_page_url?: string | null
          notion_remote_edited_at?: string | null
          notion_sync_error?: string | null
          notion_synced_at?: string | null
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
          linear_issue_id?: string | null
          linear_issue_url?: string | null
          linear_sync_error?: string | null
          linear_synced_at?: string | null
          media?: Json | null
          notion_body_hash?: string | null
          notion_handled_comment_ids?: Json
          notion_observed_date?: string | null
          notion_observed_status?: string | null
          notion_page_id?: string | null
          notion_page_url?: string | null
          notion_remote_edited_at?: string | null
          notion_sync_error?: string | null
          notion_synced_at?: string | null
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
          simkl_last_activity: string | null
          simkl_pkce_ciphertext: string | null
          simkl_pkce_iv: string | null
          simkl_redirect_uri: string | null
          simkl_refresh_token_ciphertext: string | null
          simkl_refresh_token_iv: string | null
          simkl_token_ciphertext: string | null
          simkl_token_expires_at: string | null
          simkl_token_iv: string | null
          status: string
          sync_started_at: string | null
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
          simkl_last_activity?: string | null
          simkl_pkce_ciphertext?: string | null
          simkl_pkce_iv?: string | null
          simkl_redirect_uri?: string | null
          simkl_refresh_token_ciphertext?: string | null
          simkl_refresh_token_iv?: string | null
          simkl_token_ciphertext?: string | null
          simkl_token_expires_at?: string | null
          simkl_token_iv?: string | null
          status?: string
          sync_started_at?: string | null
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
          simkl_last_activity?: string | null
          simkl_pkce_ciphertext?: string | null
          simkl_pkce_iv?: string | null
          simkl_redirect_uri?: string | null
          simkl_refresh_token_ciphertext?: string | null
          simkl_refresh_token_iv?: string | null
          simkl_token_ciphertext?: string | null
          simkl_token_expires_at?: string | null
          simkl_token_iv?: string | null
          status?: string
          sync_started_at?: string | null
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
      movie_streaming_alert_mutes: {
        Row: {
          created_at: string
          title: string
          tmdb_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          title: string
          tmdb_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          title?: string
          tmdb_id?: number
          user_id?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          claimed_at: string
          created_at: string
          error: string | null
          notification_id: string
          provider_ref: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel: string
          claimed_at?: string
          created_at?: string
          error?: string | null
          notification_id: string
          provider_ref?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          claimed_at?: string
          created_at?: string
          error?: string | null
          notification_id?: string
          provider_ref?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          push_enabled: boolean
          push_enabled_at: string | null
          streaming_alerts: boolean
          streaming_email: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          push_enabled?: boolean
          push_enabled_at?: string | null
          streaming_alerts?: boolean
          streaming_email?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          push_enabled?: boolean
          push_enabled_at?: string | null
          streaming_alerts?: boolean
          streaming_email?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_deliveries: {
        Row: {
          notification_id: string
          token: string
          status: string
          attempts: number
          provider_ref: string | null
          error: string | null
          claimed_at: string | null
          sent_at: string | null
          receipted_at: string | null
          created_at: string
        }
        Insert: {
          notification_id: string
          token: string
          status?: string
          attempts?: number
          provider_ref?: string | null
          error?: string | null
          claimed_at?: string | null
          sent_at?: string | null
          receipted_at?: string | null
          created_at?: string
        }
        Update: {
          notification_id?: string
          token?: string
          status?: string
          attempts?: number
          provider_ref?: string | null
          error?: string | null
          claimed_at?: string | null
          sent_at?: string | null
          receipted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          token: string
          user_id: string
          platform: string
          created_at: string
          last_seen_at: string
          disabled_at: string | null
        }
        Insert: {
          token: string
          user_id: string
          platform: string
          created_at?: string
          last_seen_at?: string
          disabled_at?: string | null
        }
        Update: {
          token?: string
          user_id?: string
          platform?: string
          created_at?: string
          last_seen_at?: string
          disabled_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          air_date: string | null
          created_at: string
          dedupe_key: string | null
          episode_count: number
          episode_number: number | null
          id: string
          media_poster_path: string | null
          media_title: string | null
          media_type: string | null
          person_name: string | null
          person_profile_path: string | null
          person_role: string | null
          person_tmdb_id: number | null
          post_id: string | null
          provider_name: string | null
          read_at: string | null
          release_kind: string | null
          season_number: number | null
          smart_list_digest: Json | null
          tmdb_id: number | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          air_date?: string | null
          created_at?: string
          dedupe_key?: string | null
          episode_count?: number
          episode_number?: number | null
          id?: string
          media_poster_path?: string | null
          media_title?: string | null
          media_type?: string | null
          person_name?: string | null
          person_profile_path?: string | null
          person_role?: string | null
          person_tmdb_id?: number | null
          post_id?: string | null
          provider_name?: string | null
          read_at?: string | null
          release_kind?: string | null
          season_number?: number | null
          smart_list_digest?: Json | null
          tmdb_id?: number | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          air_date?: string | null
          created_at?: string
          dedupe_key?: string | null
          episode_count?: number
          episode_number?: number | null
          id?: string
          media_poster_path?: string | null
          media_title?: string | null
          media_type?: string | null
          person_name?: string | null
          person_profile_path?: string | null
          person_role?: string | null
          person_tmdb_id?: number | null
          post_id?: string | null
          provider_name?: string | null
          read_at?: string | null
          release_kind?: string | null
          season_number?: number | null
          smart_list_digest?: Json | null
          tmdb_id?: number | null
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
      people_feed: {
        Row: {
          character: string | null
          episode_count: number | null
          kind: string
          media_type: string
          network: string | null
          person_name: string
          person_role: string
          poster_path: string | null
          premiere_drop: number | null
          regional_releases: Json
          release_date: string | null
          season_number: number
          title: string
          tmdb_id: number
          tmdb_person_id: number
          updated_at: string
        }
        Insert: {
          character?: string | null
          episode_count?: number | null
          kind: string
          media_type: string
          network?: string | null
          person_name: string
          person_role: string
          poster_path?: string | null
          premiere_drop?: number | null
          regional_releases?: Json
          release_date?: string | null
          season_number?: number
          title: string
          tmdb_id: number
          tmdb_person_id: number
          updated_at?: string
        }
        Update: {
          character?: string | null
          episode_count?: number | null
          kind?: string
          media_type?: string
          network?: string | null
          person_name?: string
          person_role?: string
          poster_path?: string | null
          premiere_drop?: number | null
          regional_releases?: Json
          release_date?: string | null
          season_number?: number
          title?: string
          tmdb_id?: number
          tmdb_person_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      person_alerts: {
        Row: {
          created_at: string
          known_for: string | null
          name: string
          profile_path: string | null
          tmdb_person_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          known_for?: string | null
          name: string
          profile_path?: string | null
          tmdb_person_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          known_for?: string | null
          name?: string
          profile_path?: string | null
          tmdb_person_id?: number
          user_id?: string
        }
        Relationships: []
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
      private_title_notes: {
        Row: {
          media_type: string
          note: string
          revision: number
          title: string
          tmdb_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          media_type: string
          note: string
          revision?: number
          title?: string
          tmdb_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          media_type?: string
          note?: string
          revision?: number
          title?: string
          tmdb_id?: number
          updated_at?: string
          user_id?: string
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
          watch_together_requests_from: string
          watchlist_availability_alerts: boolean
          watchlist_visibility: string | null
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
          watch_together_requests_from?: string
          watchlist_availability_alerts?: boolean
          watchlist_visibility?: string | null
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
          watch_together_requests_from?: string
          watchlist_availability_alerts?: boolean
          watchlist_visibility?: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string
          is_premium: boolean | null
          is_supporter: boolean
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id: string
          is_premium?: boolean | null
          is_supporter: boolean
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string
          is_premium?: boolean | null
          is_supporter?: boolean
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          linear_issue_id: string | null
          linear_issue_url: string | null
          linear_sync_error: string | null
          linear_synced_at: string | null
          reason: string
          reported_id: string
          reporter_id: string | null
          status: string
          surface: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          linear_issue_id?: string | null
          linear_issue_url?: string | null
          linear_sync_error?: string | null
          linear_synced_at?: string | null
          reason: string
          reported_id: string
          reporter_id?: string | null
          status?: string
          surface: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          linear_issue_id?: string | null
          linear_issue_url?: string | null
          linear_sync_error?: string | null
          linear_synced_at?: string | null
          reason?: string
          reported_id?: string
          reporter_id?: string | null
          status?: string
          surface?: string
        }
        Relationships: []
      }
      season_ready_alerts: {
        Row: {
          created_at: string
          poster_path: string | null
          title: string
          tmdb_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          poster_path?: string | null
          title: string
          tmdb_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          poster_path?: string | null
          title?: string
          tmdb_id?: number
          user_id?: string
        }
        Relationships: []
      }
      smart_list_seen: {
        Row: {
          last_checked_at: string | null
          last_opened_at: string | null
          list_id: string
          pending_keys: string[]
          seen_keys: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          last_checked_at?: string | null
          last_opened_at?: string | null
          list_id: string
          pending_keys?: string[]
          seen_keys?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          last_checked_at?: string | null
          last_opened_at?: string | null
          list_id?: string
          pending_keys?: string[]
          seen_keys?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_list_seen_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: true
            referencedRelation: "user_custom_lists"
            referencedColumns: ["id"]
          },
        ]
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
      title_availability: {
        Row: {
          baselined_at: string
          confirmed: Json
          last_checked_at: string
          missing: Json
          pending: Json
          region: string
          tmdb_id: number
          updated_at: string
        }
        Insert: {
          baselined_at?: string
          confirmed?: Json
          last_checked_at?: string
          missing?: Json
          pending?: Json
          region: string
          tmdb_id: number
          updated_at?: string
        }
        Update: {
          baselined_at?: string
          confirmed?: Json
          last_checked_at?: string
          missing?: Json
          pending?: Json
          region?: string
          tmdb_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      title_page_index: {
        Row: {
          last_seen_at: string
          media_type: string
          title: string
          tmdb_id: number
        }
        Insert: {
          last_seen_at?: string
          media_type: string
          title: string
          tmdb_id: number
        }
        Update: {
          last_seen_at?: string
          media_type?: string
          title?: string
          tmdb_id?: number
        }
        Relationships: []
      }
      title_sitemap_cache: {
        Row: {
          generated_at: string
          id: number
          url_count: number
          xml: string
        }
        Insert: {
          generated_at?: string
          id?: number
          url_count?: number
          xml: string
        }
        Update: {
          generated_at?: string
          id?: number
          url_count?: number
          xml?: string
        }
        Relationships: []
      }
      tracking_connections: {
        Row: {
          automatic_enabled: boolean
          created_at: string
          cursor_at: string | null
          integration_id: string
          last_full_at: string | null
          last_success_at: string | null
          next_sync_at: string
          outgoing_enabled: boolean
          user_id: string
        }
        Insert: {
          automatic_enabled?: boolean
          created_at?: string
          cursor_at?: string | null
          integration_id: string
          last_full_at?: string | null
          last_success_at?: string | null
          next_sync_at?: string
          outgoing_enabled?: boolean
          user_id: string
        }
        Update: {
          automatic_enabled?: boolean
          created_at?: string
          cursor_at?: string | null
          integration_id?: string
          last_full_at?: string | null
          last_success_at?: string | null
          next_sync_at?: string
          outgoing_enabled?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_connections_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "media_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_import_items: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          source_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload: Json
          source_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          source_key?: string
          user_id?: string
        }
        Relationships: []
      }
      tracking_jobs: {
        Row: {
          attempts: number
          available_at: string
          checkpoint: Json
          created_at: string
          duplicates: number
          finished_at: string | null
          id: string
          imported: number
          integration_id: string
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          mode: string
          provider: string
          review_count: number
          skipped: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          checkpoint?: Json
          created_at?: string
          duplicates?: number
          finished_at?: string | null
          id?: string
          imported?: number
          integration_id: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          mode: string
          provider: string
          review_count?: number
          skipped?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          checkpoint?: Json
          created_at?: string
          duplicates?: number
          finished_at?: string | null
          id?: string
          imported?: number
          integration_id?: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          mode?: string
          provider?: string
          review_count?: number
          skipped?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "media_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_review_items: {
        Row: {
          created_at: string
          decision: string
          id: string
          integration_id: string
          payload: Json
          source_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decision?: string
          id?: string
          integration_id: string
          payload: Json
          source_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          integration_id?: string
          payload?: Json
          source_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_review_items_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "media_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      user_custom_list_invites: {
        Row: {
          created_at: string
          created_by: string | null
          invite_key: string
          list_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          invite_key: string
          list_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          invite_key?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_list_invites_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: true
            referencedRelation: "user_custom_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      user_custom_list_items: {
        Row: {
          added_at: string | null
          added_by: string | null
          genre_ids: number[]
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
          added_by?: string | null
          genre_ids?: number[]
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
          added_by?: string | null
          genre_ids?: number[]
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
          {
            foreignKeyName: "user_custom_list_items_parent_owner_fkey"
            columns: ["list_id", "user_id"]
            isOneToOne: false
            referencedRelation: "user_custom_lists"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      user_custom_list_members: {
        Row: {
          added_by: string | null
          created_at: string
          list_id: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          list_id: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          list_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_list_members_list_id_fkey"
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
          digest_enabled: boolean
          id: string
          is_public: boolean
          name: string
          rules: Json | null
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string | null
          digest_enabled?: boolean
          id?: string
          is_public?: boolean
          name: string
          rules?: Json | null
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string | null
          digest_enabled?: boolean
          id?: string
          is_public?: boolean
          name?: string
          rules?: Json | null
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      user_favourites: {
        Row: {
          created_at: string | null
          genre_ids: number[]
          id: string
          media_type: string
          poster_path: string | null
          title: string
          tmdb_id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          genre_ids?: number[]
          id?: string
          media_type: string
          poster_path?: string | null
          title: string
          tmdb_id: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          genre_ids?: number[]
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
      watch_events: {
        Row: {
          created_at: string
          date_precision: string
          episode_number: number | null
          external_ids: Json
          id: string
          media_type: string
          season_number: number | null
          source: string
          source_account: string
          source_key: string
          source_rating: number | null
          source_review: string | null
          tmdb_id: number
          user_id: string
          watched_at: string | null
          watched_on: string | null
        }
        Insert: {
          created_at?: string
          date_precision: string
          episode_number?: number | null
          external_ids?: Json
          id?: string
          media_type: string
          season_number?: number | null
          source: string
          source_account: string
          source_key: string
          source_rating?: number | null
          source_review?: string | null
          tmdb_id: number
          user_id: string
          watched_at?: string | null
          watched_on?: string | null
        }
        Update: {
          created_at?: string
          date_precision?: string
          episode_number?: number | null
          external_ids?: Json
          id?: string
          media_type?: string
          season_number?: number | null
          source?: string
          source_account?: string
          source_key?: string
          source_rating?: number | null
          source_review?: string | null
          tmdb_id?: number
          user_id?: string
          watched_at?: string | null
          watched_on?: string | null
        }
        Relationships: []
      }
      watch_together: {
        Row: {
          accepted_at: string | null
          created_at: string
          recipient_id: string
          requester_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          recipient_id: string
          requester_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          recipient_id?: string
          requester_id?: string
          status?: string
        }
        Relationships: []
      }
      watch_together_closed: {
        Row: {
          closed_at: string
          recipient_id: string
          requester_id: string
        }
        Insert: {
          closed_at?: string
          recipient_id: string
          requester_id: string
        }
        Update: {
          closed_at?: string
          recipient_id?: string
          requester_id?: string
        }
        Relationships: []
      }
      watch_together_links: {
        Row: {
          created_at: string
          link_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          link_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          link_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_together_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_together_sessions: {
        Row: {
          created_at: string
          deck: Json
          ended_at: string | null
          guest_id: string
          host_id: string
          id: string
          status: string
        }
        Insert: {
          created_at?: string
          deck?: Json
          ended_at?: string | null
          guest_id: string
          host_id: string
          id?: string
          status?: string
        }
        Update: {
          created_at?: string
          deck?: Json
          ended_at?: string | null
          guest_id?: string
          host_id?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      watch_together_votes: {
        Row: {
          created_at: string
          media_type: string
          session_id: string
          tmdb_id: number
          user_id: string
          yes: boolean
        }
        Insert: {
          created_at?: string
          media_type: string
          session_id: string
          tmdb_id: number
          user_id: string
          yes: boolean
        }
        Update: {
          created_at?: string
          media_type?: string
          session_id?: string
          tmdb_id?: number
          user_id?: string
          yes?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "watch_together_votes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "watch_together_sessions"
            referencedColumns: ["id"]
          },
        ]
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
      watchlist_viewers: {
        Row: {
          created_at: string
          owner_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          viewer_id?: string
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
    }
    Functions: {
      accept_list_invite: { Args: { p_key: string }; Returns: string }
      accept_watch_together_link: {
        Args: { p_key: string; p_share_full?: boolean }
        Returns: string
      }
      add_shared_list_item: {
        Args: {
          p_genre_ids?: number[]
          p_list: string
          p_media_type: string
          p_poster_path?: string
          p_title: string
          p_tmdb_id: number
        }
        Returns: undefined
      }
      add_shared_list_member: {
        Args: { p_list: string; p_user: string }
        Returns: boolean
      }
      admit_critic_score_request: {
        Args: { p_caller_bucket: string }
        Returns: boolean
      }
      alert_email_recipients: {
        Args: { p_users: string[] }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      register_push_token: {
        Args: { p_token: string; p_platform: string }
        Returns: undefined
      }
      apply_stripe_subscription_event: {
        Args: {
          p_cancel_at_period_end: boolean
          p_current_period_end: string
          p_customer_id: string
          p_event_created: string
          p_event_id: string
          p_event_type: string
          p_price_id: string
          p_status: string
          p_subscription_id: string
          p_user_id: string
        }
        Returns: Json
      }
      apply_stripe_subscription_snapshot: {
        Args: {
          p_cancel_at_period_end: boolean
          p_current_period_end: string
          p_customer_id: string
          p_event_created: string
          p_event_id: string
          p_event_type: string
          p_expected_revision: number
          p_price_id: string
          p_status: string
          p_subscription_id: string
          p_user_id: string
        }
        Returns: Json
      }
      auth_note_fail: {
        Args: { p_ip: string; p_scope: string; p_window_ms: number }
        Returns: number
      }
      can_create_custom_list: { Args: never; Returns: boolean }
      can_edit_shared_list: { Args: { p_list: string }; Returns: boolean }
      can_see_full_watchlist: { Args: { p_other: string }; Returns: boolean }
      can_view_custom_list: {
        Args: { p_owner: string; p_visibility: string }
        Returns: boolean
      }
      can_view_profile: { Args: { p_uid: string }; Returns: boolean }
      can_view_watchlist: { Args: { p_owner: string }; Returns: boolean }
      cancel_watch_together_request: {
        Args: { p_recipient: string }
        Returns: undefined
      }
      claim_billing_checkout: {
        Args: { p_price_id: string; p_settings_url: string; p_user_id: string }
        Returns: Json
      }
      claim_marketing_linear_mirror: {
        Args: { p_owner: string }
        Returns: boolean
      }
      claim_marketing_notion_mirror: {
        Args: { p_owner: string }
        Returns: boolean
      }
      claim_tracking_job: {
        Args: { p_provider: string; p_users?: string[] }
        Returns: Json
      }
      control_tracking: {
        Args: { p_action: string; p_integration: string }
        Returns: Json
      }
      create_shared_list: {
        Args: { p_members: string[]; p_name: string; p_seed_partner?: string }
        Returns: string
      }
      end_watch_together: { Args: { p_other: string }; Returns: undefined }
      end_watch_together_session: {
        Args: { p_session: string }
        Returns: undefined
      }
      enqueue_due_tracking_jobs: {
        Args: { p_provider: string; p_users?: string[] }
        Returns: number
      }
      fail_tracking_job: {
        Args: {
          p_error: string
          p_job: string
          p_lease: string
          p_retry_seconds?: number
          p_terminal?: boolean
        }
        Returns: boolean
      }
      finish_tracking_page: {
        Args: {
          p_checkpoint: Json
          p_done: boolean
          p_job: string
          p_lease: string
          p_records: Json
          p_skipped?: number
        }
        Returns: Json
      }
      generate_username: { Args: { p_seed: string }; Returns: string }
      get_follow_counts: {
        Args: { p_target: string }
        Returns: {
          followers: number
          following: number
        }[]
      }
      get_my_billing_status: { Args: never; Returns: Json }
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
      get_shared_list: {
        Args: { p_list_id: string }
        Returns: {
          id: string
          items: Json
          name: string
          user_id: string
          visibility: string
        }[]
      }
      get_watch_together_session: { Args: { p_session: string }; Returns: Json }
      import_saved_annotations: { Args: { p_records: Json }; Returns: Json }
      import_saved_list: {
        Args: { p_list: Json; p_records: Json }
        Returns: Json
      }
      import_watch_events: { Args: { p_records: Json }; Returns: Json }
      is_accepted_follower: { Args: { p_target: string }; Returns: boolean }
      is_custom_list_member: { Args: { p_list: string }; Returns: boolean }
      is_premium: { Args: { p_user?: string }; Returns: boolean }
      is_profile_public: { Args: { p_uid: string }; Returns: boolean }
      is_selected_watchlist_viewer: {
        Args: { p_owner: string }
        Returns: boolean
      }
      is_watch_together_partner: { Args: { p_other: string }; Returns: boolean }
      leave_shared_list: { Args: { p_list: string }; Returns: undefined }
      list_blocked_users: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          id: string
          username: string
        }[]
      }
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
      list_host_is_premium: { Args: { p_list: string }; Returns: boolean }
      list_invite_peek: {
        Args: { p_key: string }
        Returns: {
          member_count: number
          members: Json
          posters: string[]
        }[]
      }
      list_invite_preview: {
        Args: { p_key: string }
        Returns: {
          avatar_url: string
          display_name: string
          host_premium: boolean
          item_count: number
          list_id: string
          list_name: string
          owner_id: string
          state: string
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
          air_date: string
          created_at: string
          episode_count: number
          episode_number: number
          id: string
          media_poster_path: string
          media_title: string
          media_type: string
          person_name: string
          person_profile_path: string
          person_role: string
          person_tmdb_id: number
          post_id: string
          post_poster_path: string
          post_title: string
          provider_name: string
          read_at: string
          release_kind: string
          season_number: number
          smart_list_digest: Json
          tmdb_id: number
          type: string
        }[]
      }
      list_shared_list_people: {
        Args: { p_lists: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          is_owner: boolean
          list_id: string
          user_id: string
          username: string
        }[]
      }
      list_watch_together: {
        Args: never
        Returns: {
          accepted_at: string
          avatar_url: string
          can_decide: boolean
          created_at: string
          direction: string
          display_name: string
          i_share_full: boolean
          other_id: string
          overlap_count: number
          username: string
        }[]
      }
      list_watchlist_viewer_candidates: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          is_follower: boolean
          is_partner: boolean
          selected: boolean
          username: string
        }[]
      }
      live_watch_together_session: {
        Args: { p_other: string }
        Returns: string
      }
      marketing_recipient_list: {
        Args: never
        Returns: {
          email: string
          unsubscribe_token: string
        }[]
      }
      my_list_invite: { Args: { p_list: string }; Returns: string }
      my_watch_together_link: { Args: never; Returns: string }
      new_watch_together_link_key: { Args: never; Returns: string }
      not_blocked: { Args: { p_uid: string }; Returns: boolean }
      premium_user_ids: { Args: { p_users: string[] }; Returns: string[] }
      profile_links_ok: { Args: { l: Json }; Returns: boolean }
      prune_watchlist_viewer: {
        Args: { p_owner: string; p_viewer: string }
        Returns: undefined
      }
      record_kofi_tip: { Args: { p_payload: Json }; Returns: Json }
      refresh_premium_badges: { Args: never; Returns: number }
      release_marketing_linear_mirror: {
        Args: { p_owner: string }
        Returns: undefined
      }
      release_marketing_notion_mirror: {
        Args: { p_owner: string }
        Returns: undefined
      }
      remove_shared_list_item: {
        Args: { p_list: string; p_tmdb_id: number }
        Returns: undefined
      }
      rename_shared_list: {
        Args: { p_list: string; p_name: string }
        Returns: undefined
      }
      reset_list_invite: { Args: { p_list: string }; Returns: string }
      reset_watch_together_link: { Args: never; Returns: string }
      resolve_tracking_review: {
        Args: { p_keep: boolean; p_review: string }
        Returns: Json
      }
      respond_watch_together_request: {
        Args: { p_accept: boolean; p_requester: string; p_share_full?: boolean }
        Returns: undefined
      }
      run_alert_email_delivery: { Args: never; Returns: undefined }
      run_marketing_linear_mirror: { Args: never; Returns: undefined }
      run_marketing_notion_mirror: { Args: never; Returns: undefined }
      run_movie_release_notifications: { Args: never; Returns: undefined }
      run_new_episode_notifications: { Args: never; Returns: undefined }
      run_premium_alerts: { Args: { p_only: string }; Returns: undefined }
      run_smart_list_digest: { Args: never; Returns: undefined }
      run_streaming_arrival_alerts: { Args: never; Returns: undefined }
      save_private_title_note: {
        Args: {
          p_expected_revision: number
          p_media_type: string
          p_note: string
          p_title?: string
          p_tmdb_id: number
          p_user_id: string
        }
        Returns: {
          media_type: string
          note: string
          revision: number
          title: string
          tmdb_id: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "private_title_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_tracking_tokens: {
        Args: {
          p_access: string
          p_access_iv: string
          p_expires: string
          p_job: string
          p_lease: string
          p_refresh: string
          p_refresh_iv: string
        }
        Returns: boolean
      }
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
      select_plex_tracking_source: {
        Args: { p_integration: string; p_selection: Json; p_servers: Json }
        Returns: undefined
      }
      send_watch_together_request: {
        Args: { p_recipient: string }
        Returns: string
      }
      set_watch_together_share_full: {
        Args: { p_other: string; p_share: boolean }
        Returns: undefined
      }
      share_watchlist_with: {
        Args: { p_on: boolean; p_promote?: boolean; p_viewer: string }
        Returns: undefined
      }
      start_watch_together_session: {
        Args: { p_other: string }
        Returns: string
      }
      suggest_watch_together: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          overlap_count: number
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
      taste_overlap: { Args: { p_username: string }; Returns: Json }
      taste_overlap_rows: { Args: { p_user: string }; Returns: Json }
      username_available: { Args: { p_username: string }; Returns: boolean }
      vote_watch_together: {
        Args: {
          p_media_type: string
          p_session: string
          p_tmdb_id: number
          p_yes: boolean
        }
        Returns: boolean
      }
      watch_together_link_owner: {
        Args: { p_key: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
        }[]
      }
      watch_together_link_status: {
        Args: { p_key: string }
        Returns: {
          avatar_url: string
          can_decide: boolean
          display_name: string
          id: string
          state: string
          username: string
        }[]
      }
      watch_together_overlap_count: {
        Args: { p_other: string }
        Returns: number
      }
      watch_together_row: {
        Args: { p_other: string }
        Returns: {
          accepted_at: string | null
          created_at: string
          recipient_id: string
          requester_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "watch_together"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      watch_together_savers: {
        Args: { p_media_type: string; p_tmdb_id: number }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
        }[]
      }
      watch_together_session_for_caller: {
        Args: { p_session: string }
        Returns: {
          created_at: string
          deck: Json
          ended_at: string | null
          guest_id: string
          host_id: string
          id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "watch_together_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      watch_together_session_live: {
        Args: {
          s: Database["public"]["Tables"]["watch_together_sessions"]["Row"]
        }
        Returns: boolean
      }
      watch_together_status: {
        Args: { p_other: string }
        Returns: {
          overlap_count: number
          state: string
        }[]
      }
      watch_together_titles: {
        Args: { p_others: string[] }
        Returns: {
          genre_ids: number[]
          media_type: string
          poster_path: string
          provider_ids: number[]
          release_date: string
          saved_by: string[]
          title: string
          tmdb_id: number
        }[]
      }
      watchlist_keys: {
        Args: { p_user: string }
        Returns: {
          media_type: string
          tmdb_id: number
        }[]
      }
      watchlist_visibility_of: { Args: { p_owner: string }; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

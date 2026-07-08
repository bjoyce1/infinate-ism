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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_archived: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      capism_events: {
        Row: {
          community: number | null
          created_at: string
          id: string
          kind: string
          node_id: string | null
          node_label: string | null
          payload: Json
          session_id: string | null
        }
        Insert: {
          community?: number | null
          created_at?: string
          id?: string
          kind: string
          node_id?: string | null
          node_label?: string | null
          payload?: Json
          session_id?: string | null
        }
        Update: {
          community?: number | null
          created_at?: string
          id?: string
          kind?: string
          node_id?: string | null
          node_label?: string | null
          payload?: Json
          session_id?: string | null
        }
        Relationships: []
      }
      captures: {
        Row: {
          body: string | null
          created_at: string
          file_url: string | null
          id: string
          next_action: string | null
          priority: Database["public"]["Enums"]["brain_priority"]
          project_id: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["brain_capture_status"]
          tags: string[]
          title: string
          type: Database["public"]["Enums"]["brain_capture_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          next_action?: string | null
          priority?: Database["public"]["Enums"]["brain_priority"]
          project_id?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["brain_capture_status"]
          tags?: string[]
          title?: string
          type?: Database["public"]["Enums"]["brain_capture_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          next_action?: string | null
          priority?: Database["public"]["Enums"]["brain_priority"]
          project_id?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["brain_capture_status"]
          tags?: string[]
          title?: string
          type?: Database["public"]["Enums"]["brain_capture_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "captures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          budget_cents: number | null
          company: string | null
          created_at: string
          deliverables: string | null
          email: string | null
          follow_up_date: string | null
          id: string
          is_archived: boolean
          name: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["brain_payment_status"]
          phone: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          budget_cents?: number | null
          company?: string | null
          created_at?: string
          deliverables?: string | null
          email?: string | null
          follow_up_date?: string | null
          id?: string
          is_archived?: boolean
          name: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["brain_payment_status"]
          phone?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          budget_cents?: number | null
          company?: string | null
          created_at?: string
          deliverables?: string | null
          email?: string | null
          follow_up_date?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["brain_payment_status"]
          phone?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      link_clicks: {
        Row: {
          clicked_at: string
          id: string
          link_type: string
          node_category: string | null
          node_id: string
          node_label: string | null
          referrer: string | null
          url: string
        }
        Insert: {
          clicked_at?: string
          id?: string
          link_type: string
          node_category?: string | null
          node_id: string
          node_label?: string | null
          referrer?: string | null
          url: string
        }
        Update: {
          clicked_at?: string
          id?: string
          link_type?: string
          node_category?: string | null
          node_id?: string
          node_label?: string | null
          referrer?: string | null
          url?: string
        }
        Relationships: []
      }
      node_embeddings: {
        Row: {
          embedding: string
          label: string | null
          node_id: string
          text_hash: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          embedding: string
          label?: string | null
          node_id: string
          text_hash: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          embedding?: string
          label?: string | null
          node_id?: string
          text_hash?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      node_image_overrides: {
        Row: {
          image_url: string
          node_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          image_url: string
          node_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          image_url?: string
          node_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      node_links: {
        Row: {
          created_at: string
          id: string
          relation: string | null
          source_id: string
          source_kind: Database["public"]["Enums"]["brain_node_kind"]
          target_id: string
          target_kind: Database["public"]["Enums"]["brain_node_kind"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          relation?: string | null
          source_id: string
          source_kind: Database["public"]["Enums"]["brain_node_kind"]
          target_id: string
          target_kind: Database["public"]["Enums"]["brain_node_kind"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relation?: string | null
          source_id?: string
          source_kind?: Database["public"]["Enums"]["brain_node_kind"]
          target_id?: string
          target_kind?: Database["public"]["Enums"]["brain_node_kind"]
          user_id?: string
        }
        Relationships: []
      }
      node_notes: {
        Row: {
          created_at: string
          id: string
          node_id: string
          note: string | null
          related_node_id: string | null
          summary: string | null
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          node_id: string
          note?: string | null
          related_node_id?: string | null
          summary?: string | null
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          node_id?: string
          note?: string | null
          related_node_id?: string | null
          summary?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          area_id: string | null
          content: string
          created_at: string
          id: string
          is_archived: boolean
          project_id: string | null
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_archived?: boolean
          project_id?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_archived?: boolean
          project_id?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          ai_summary: string | null
          area_id: string | null
          client_id: string | null
          color: string | null
          created_at: string
          deadline: string | null
          goal: string | null
          id: string
          name: string
          next_action: string | null
          priority: Database["public"]["Enums"]["brain_priority"]
          revenue_potential_cents: number | null
          status: Database["public"]["Enums"]["brain_project_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          area_id?: string | null
          client_id?: string | null
          color?: string | null
          created_at?: string
          deadline?: string | null
          goal?: string | null
          id?: string
          name: string
          next_action?: string | null
          priority?: Database["public"]["Enums"]["brain_priority"]
          revenue_potential_cents?: number | null
          status?: Database["public"]["Enums"]["brain_project_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          area_id?: string | null
          client_id?: string | null
          color?: string | null
          created_at?: string
          deadline?: string | null
          goal?: string | null
          id?: string
          name?: string
          next_action?: string | null
          priority?: Database["public"]["Enums"]["brain_priority"]
          revenue_potential_cents?: number | null
          status?: Database["public"]["Enums"]["brain_project_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_archived: boolean
          notes: string | null
          platform: string | null
          project_id: string | null
          prompt: string
          rating: number | null
          title: string
          updated_at: string
          use_case: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          notes?: string | null
          platform?: string | null
          project_id?: string | null
          prompt: string
          rating?: number | null
          title: string
          updated_at?: string
          use_case?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          notes?: string | null
          platform?: string | null
          project_id?: string | null
          prompt?: string
          rating?: number | null
          title?: string
          updated_at?: string
          use_case?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          area_id: string | null
          content: string | null
          created_at: string
          id: string
          is_archived: boolean
          project_id: string | null
          tags: string[]
          title: string
          type: Database["public"]["Enums"]["brain_resource_type"]
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          area_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          project_id?: string | null
          tags?: string[]
          title: string
          type?: Database["public"]["Enums"]["brain_resource_type"]
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          area_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          project_id?: string | null
          tags?: string[]
          title?: string
          type?: Database["public"]["Enums"]["brain_resource_type"]
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["brain_priority"]
          project_id: string | null
          status: Database["public"]["Enums"]["brain_task_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["brain_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["brain_task_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["brain_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["brain_task_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      capism_stats: {
        Row: {
          clicks_24h: number | null
          clicks_60s: number | null
          clicks_total: number | null
          events_24h: number | null
          events_60s: number | null
          events_total: number | null
          nodes_engaged: number | null
          overrides_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_nodes: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          label: string
          node_id: string
          similarity: number
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      brain_capture_status: "inbox" | "processed" | "archived"
      brain_capture_type:
        | "note"
        | "idea"
        | "voice"
        | "link"
        | "client_note"
        | "project_thought"
        | "lyrics"
        | "business_idea"
        | "file"
        | "ai_prompt"
        | "screenshot"
      brain_node_kind:
        | "project"
        | "area"
        | "task"
        | "note"
        | "capture"
        | "client"
        | "resource"
        | "prompt"
      brain_payment_status: "none" | "unpaid" | "partial" | "paid" | "overdue"
      brain_priority: "low" | "medium" | "high" | "urgent"
      brain_project_status: "active" | "paused" | "completed" | "archived"
      brain_resource_type:
        | "prompt"
        | "template"
        | "design_reference"
        | "sow"
        | "contract"
        | "lyrics"
        | "brand_asset"
        | "seo_note"
        | "research"
        | "other"
      brain_task_status: "todo" | "doing" | "done" | "blocked"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
      brain_capture_status: ["inbox", "processed", "archived"],
      brain_capture_type: [
        "note",
        "idea",
        "voice",
        "link",
        "client_note",
        "project_thought",
        "lyrics",
        "business_idea",
        "file",
        "ai_prompt",
        "screenshot",
      ],
      brain_node_kind: [
        "project",
        "area",
        "task",
        "note",
        "capture",
        "client",
        "resource",
        "prompt",
      ],
      brain_payment_status: ["none", "unpaid", "partial", "paid", "overdue"],
      brain_priority: ["low", "medium", "high", "urgent"],
      brain_project_status: ["active", "paused", "completed", "archived"],
      brain_resource_type: [
        "prompt",
        "template",
        "design_reference",
        "sow",
        "contract",
        "lyrics",
        "brand_asset",
        "seo_note",
        "research",
        "other",
      ],
      brain_task_status: ["todo", "doing", "done", "blocked"],
    },
  },
} as const

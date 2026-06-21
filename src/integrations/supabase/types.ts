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
      archive_credentials: {
        Row: {
          created_at: string
          password_hash: string
          password_salt: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          password_hash: string
          password_salt: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          password_hash?: string
          password_salt?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      archive_documents: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      archive_events: {
        Row: {
          created_at: string
          event_date: string
          event_time: string | null
          id: string
          location: string | null
          notes: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_date: string
          event_time?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_date?: string
          event_time?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      archive_notes: {
        Row: {
          body: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clergy_assignments: {
        Row: {
          clergy_id: string
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          parish: string | null
          position: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          clergy_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          parish?: string | null
          position: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          clergy_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          parish?: string | null
          position?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clergy_assignments_clergy_id_fkey"
            columns: ["clergy_id"]
            isOneToOne: false
            referencedRelation: "clergy_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clergy_assignments_clergy_id_fkey"
            columns: ["clergy_id"]
            isOneToOne: false
            referencedRelation: "clergy_members_public"
            referencedColumns: ["id"]
          },
        ]
      }
      clergy_members: {
        Row: {
          assignment_role: string | null
          category: string
          created_at: string
          created_by: string | null
          current_assignment: string | null
          full_name: string
          home_parish: string | null
          id: string
          notes: string | null
          ordination_date: string | null
          other_positions: string | null
          phone_number: string | null
          updated_at: string
        }
        Insert: {
          assignment_role?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          current_assignment?: string | null
          full_name: string
          home_parish?: string | null
          id?: string
          notes?: string | null
          ordination_date?: string | null
          other_positions?: string | null
          phone_number?: string | null
          updated_at?: string
        }
        Update: {
          assignment_role?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          current_assignment?: string | null
          full_name?: string
          home_parish?: string | null
          id?: string
          notes?: string | null
          ordination_date?: string | null
          other_positions?: string | null
          phone_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          achievements: string | null
          challenges: string | null
          created_at: string
          department_id: string | null
          id: string
          log_date: string
          recommendations: string | null
          user_id: string
        }
        Insert: {
          achievements?: string | null
          challenges?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          log_date: string
          recommendations?: string | null
          user_id: string
        }
        Update: {
          achievements?: string | null
          challenges?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          log_date?: string
          recommendations?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      department_staff: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_staff_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          hod_id: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hod_id?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hod_id?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      diocesan_events: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          event_date: string
          id: string
          notes: string | null
          title: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          event_date: string
          id?: string
          notes?: string | null
          title: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          event_date?: string
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diocesan_events_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      diocese_leadership: {
        Row: {
          created_at: string
          holder_name: string | null
          id: string
          notes: string | null
          position_key: string
          position_title: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          holder_name?: string | null
          id?: string
          notes?: string | null
          position_key: string
          position_title: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          holder_name?: string | null
          id?: string
          notes?: string | null
          position_key?: string
          position_title?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      driver_logs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approver_notes: string | null
          closing_km: number | null
          condition_end: string | null
          condition_start: string | null
          created_at: string
          department_id: string | null
          destination: string
          fuel_litres: number | null
          fuel_order_amount: number | null
          id: string
          log_date: string
          passengers: number | null
          start_point: string
          starting_km: number
          status: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approver_notes?: string | null
          closing_km?: number | null
          condition_end?: string | null
          condition_start?: string | null
          created_at?: string
          department_id?: string | null
          destination: string
          fuel_litres?: number | null
          fuel_order_amount?: number | null
          id?: string
          log_date: string
          passengers?: number | null
          start_point: string
          starting_km: number
          status?: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approver_notes?: string | null
          closing_km?: number | null
          condition_end?: string | null
          condition_start?: string | null
          created_at?: string
          department_id?: string | null
          destination?: string
          fuel_litres?: number | null
          fuel_order_amount?: number | null
          id?: string
          log_date?: string
          passengers?: number | null
          start_point?: string
          starting_km?: number
          status?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_logs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          applicant_name: string
          approved_at: string | null
          approved_by: string | null
          approver_notes: string | null
          contact_while_away: string
          created_at: string
          days_requested: number
          department_id: string | null
          from_date: string
          id: string
          reason: string | null
          status: string
          to_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applicant_name: string
          approved_at?: string | null
          approved_by?: string | null
          approver_notes?: string | null
          contact_while_away: string
          created_at?: string
          days_requested: number
          department_id?: string | null
          from_date: string
          id?: string
          reason?: string | null
          status?: string
          to_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applicant_name?: string
          approved_at?: string | null
          approved_by?: string | null
          approver_notes?: string | null
          contact_while_away?: string
          created_at?: string
          days_requested?: number
          department_id?: string | null
          from_date?: string
          id?: string
          reason?: string | null
          status?: string
          to_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          id: string
          notification_key: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_key: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_key?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      office_attendance: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          left_at: string
          reason: string | null
          returned_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          left_at?: string
          reason?: string | null
          returned_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          left_at?: string
          reason?: string | null
          returned_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department_id: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          position: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_weekly_workplans: {
        Row: {
          created_at: string
          department_count: number
          file_path: string
          generated_by: string | null
          generated_by_name: string | null
          id: string
          week_end_date: string
          week_start_date: string
        }
        Insert: {
          created_at?: string
          department_count?: number
          file_path: string
          generated_by?: string | null
          generated_by_name?: string | null
          id?: string
          week_end_date: string
          week_start_date: string
        }
        Update: {
          created_at?: string
          department_count?: number
          file_path?: string
          generated_by?: string | null
          generated_by_name?: string | null
          id?: string
          week_end_date?: string
          week_start_date?: string
        }
        Relationships: []
      }
      uploaded_reports: {
        Row: {
          department_id: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          period_month: number
          period_year: number
          uploaded_at: string
          user_id: string
        }
        Insert: {
          department_id?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          period_month: number
          period_year: number
          uploaded_at?: string
          user_id: string
        }
        Update: {
          department_id?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          period_month?: number
          period_year?: number
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
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
      vehicle_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approver_notes: string | null
          created_at: string
          date_needed: string
          department_id: string | null
          destination: string
          id: string
          passengers: number | null
          purpose: string
          status: string
          time_from: string | null
          time_to: string | null
          user_id: string
          week_start_date: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approver_notes?: string | null
          created_at?: string
          date_needed: string
          department_id?: string | null
          destination: string
          id?: string
          passengers?: number | null
          purpose: string
          status?: string
          time_from?: string | null
          time_to?: string | null
          user_id: string
          week_start_date: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approver_notes?: string | null
          created_at?: string
          date_needed?: string
          department_id?: string | null
          destination?: string
          id?: string
          passengers?: number | null
          purpose?: string
          status?: string
          time_from?: string | null
          time_to?: string | null
          user_id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          created_at: string
          id: string
          make_model: string | null
          notes: string | null
          registration: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          make_model?: string | null
          notes?: string | null
          registration: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          make_model?: string | null
          notes?: string | null
          registration?: string
          updated_at?: string
        }
        Relationships: []
      }
      work_plan_items: {
        Row: {
          activity: string
          activity_date: string
          created_at: string
          id: string
          location: string | null
          money_amount: number | null
          needs_money: boolean
          needs_vehicle: boolean
          notes: string | null
          work_plan_id: string
        }
        Insert: {
          activity: string
          activity_date: string
          created_at?: string
          id?: string
          location?: string | null
          money_amount?: number | null
          needs_money?: boolean
          needs_vehicle?: boolean
          notes?: string | null
          work_plan_id: string
        }
        Update: {
          activity?: string
          activity_date?: string
          created_at?: string
          id?: string
          location?: string | null
          money_amount?: number | null
          needs_money?: boolean
          needs_vehicle?: boolean
          notes?: string | null
          work_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_plan_items_work_plan_id_fkey"
            columns: ["work_plan_id"]
            isOneToOne: false
            referencedRelation: "work_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      work_plans: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          signature: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          week_start_date: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          signature?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          week_start_date: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          signature?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_plans_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      clergy_members_public: {
        Row: {
          assignment_role: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          current_assignment: string | null
          full_name: string | null
          home_parish: string | null
          id: string | null
          notes: string | null
          ordination_date: string | null
          other_positions: string | null
          updated_at: string | null
        }
        Insert: {
          assignment_role?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          current_assignment?: string | null
          full_name?: string | null
          home_parish?: string | null
          id?: string | null
          notes?: string | null
          ordination_date?: string | null
          other_positions?: string | null
          updated_at?: string | null
        }
        Update: {
          assignment_role?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          current_assignment?: string | null
          full_name?: string | null
          home_parish?: string | null
          id?: string | null
          notes?: string | null
          ordination_date?: string | null
          other_positions?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_clergy_phone: { Args: { _id: string }; Returns: string }
      get_user_department: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_email_by_phone: { Args: { _phone: string }; Returns: string }
    }
    Enums: {
      app_role: "super_admin" | "hod" | "staff" | "administrator" | "driver"
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
      app_role: ["super_admin", "hod", "staff", "administrator", "driver"],
    },
  },
} as const

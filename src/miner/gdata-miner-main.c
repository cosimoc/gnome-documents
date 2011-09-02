/*
 * Copyright (c) 2011 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

#include <glib-unix.h>
#include <glib.h>

#include "gd-gdata-miner.h"

#define BUS_NAME "org.gnome.Documents.GDataMiner"
#define AUTOQUIT_TIMEOUT 5

static const gchar introspection_xml[] =
  "<node>"
  "  <interface name='org.gnome.Documents.GDataMiner'>"
  "    <method name='RefreshDB'>"
  "    </method>"
  "  </interface>"
  "</node>";

static GDBusNodeInfo *introspection_data = NULL;
static GCancellable *cancellable = NULL;
static GMainLoop *loop = NULL;
static guint name_owner_id = 0;

static gboolean
signal_handler_cb (gpointer user_data)
{
  GMainLoop *loop = user_data;

  if (cancellable != NULL)
    g_cancellable_cancel (cancellable);

  g_main_loop_quit (loop);

  return FALSE;
}

static void
miner_refresh_db_ready_cb (GObject *source,
                           GAsyncResult *res,
                           gpointer user_data)
{
  GDBusMethodInvocation *invocation = user_data;
  GError *error = NULL;

  gd_gdata_miner_refresh_db_finish (GD_GDATA_MINER (source), res, &error);

  if (error != NULL)
    {
      g_printerr ("Failed to refresh the DB cache: %s\n", error->message);
      g_dbus_method_invocation_return_gerror (invocation, error);
    }
  else
    {
      g_dbus_method_invocation_return_value (invocation, NULL);
    }

  g_object_unref (cancellable);
  g_main_loop_quit (loop);
}

static void
handle_refresh_db (GDBusMethodInvocation *invocation)
{
  GdGDataMiner *miner;

  cancellable = g_cancellable_new ();
  miner = gd_gdata_miner_new ();

  gd_gdata_miner_refresh_db_async (miner, cancellable,
                                   miner_refresh_db_ready_cb, invocation);

  g_object_unref (miner);
}

static void
handle_method_call (GDBusConnection       *connection,
                    const gchar           *sender,
                    const gchar           *object_path,
                    const gchar           *interface_name,
                    const gchar           *method_name,
                    GVariant              *parameters,
                    GDBusMethodInvocation *invocation,
                    gpointer               user_data)
{
  if (g_strcmp0 (method_name, "RefreshDB") == 0)
    handle_refresh_db (g_object_ref (invocation));
  else
    g_assert_not_reached ();
}

static const GDBusInterfaceVTable interface_vtable =
{
  handle_method_call,
  NULL, /* get_property */
  NULL, /* set_property */
};

static void
on_bus_acquired (GDBusConnection *connection,
                 const gchar *name,
                 gpointer user_data)
{
  GError *error = NULL;

  g_debug ("Connected to the session bus: %s", name);

  g_dbus_connection_register_object (connection,
                                     "/org/gnome/Documents/GDataMiner",
                                     introspection_data->interfaces[0],
                                     &interface_vtable,
                                     NULL,
                                     NULL,
                                     &error);

  if (error != NULL)
    {
      g_printerr ("Error exporting object on the session bus: %s",
                  error->message);
      g_error_free (error);

      _exit (1);
    }

  g_debug ("Object exported on the session bus");
}

static void
on_name_lost (GDBusConnection *connection,
              const gchar *name,
              gpointer user_data)
{
  g_debug ("Lost bus name: %s, exiting", name);

  if (cancellable != NULL)
    g_cancellable_cancel (cancellable);

  name_owner_id = 0;
}

static void
on_name_acquired (GDBusConnection *connection,
                  const gchar *name,
                  gpointer user_data)
{
  g_debug ("Acquired bus name: %s", name);
}

int
main (int argc,
      char **argv)
{
  g_type_init ();
  loop = g_main_loop_new (NULL, FALSE);

  g_unix_signal_add_full (G_PRIORITY_DEFAULT,
			  SIGTERM,
			  signal_handler_cb,
			  loop, NULL);
  g_unix_signal_add_full (G_PRIORITY_DEFAULT,
			  SIGINT,
			  signal_handler_cb,
			  loop, NULL);

  introspection_data = g_dbus_node_info_new_for_xml (introspection_xml, NULL);
  g_assert (introspection_data != NULL);

  name_owner_id = g_bus_own_name (G_BUS_TYPE_SESSION,
                                  BUS_NAME,
                                  G_BUS_NAME_OWNER_FLAGS_ALLOW_REPLACEMENT |
                                  G_BUS_NAME_OWNER_FLAGS_REPLACE,
                                  on_bus_acquired,
                                  on_name_acquired,
                                  on_name_lost,
                                  NULL, NULL);

  g_main_loop_run (loop);
  g_main_loop_unref (loop);

  if (name_owner_id != 0)
    g_bus_unown_name (name_owner_id);

  return 0;
}

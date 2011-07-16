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

static gboolean
signal_handler_cb (gpointer user_data)
{
  GMainLoop *loop = user_data;

  g_main_loop_quit (loop);

  return FALSE;
}

int
main (int argc,
      char **argv)
{
  GMainLoop *loop;
  GdGDataMiner *miner;

  g_type_init ();
  loop = g_main_loop_new (NULL, FALSE);

  g_unix_signal_add_watch_full (SIGTERM,
                                G_PRIORITY_DEFAULT,
                                signal_handler_cb,
                                loop, NULL);
  g_unix_signal_add_watch_full (SIGINT,
                                G_PRIORITY_DEFAULT,
                                signal_handler_cb,
                                loop, NULL);

  miner = gd_gdata_miner_new ();
  tracker_miner_start (TRACKER_MINER (miner));

  g_main_loop_run (loop);
  g_main_loop_unref (loop);
  g_object_unref (miner);

  return 0;
}

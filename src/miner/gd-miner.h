/* -*- mode: C; c-file-style: "gnu"; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Copyright (C) 2012 Red Hat
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA
 * 02111-1307, USA.
 *
 * Author: Jasper St. Pierre <jstpierre@mecheye.net>
 *
 */


#ifndef __GD_MINER_H__
#define __GD_MINER_H__

#include <libtracker-miner/tracker-miner.h>
#include <glib-object.h>
#define GOA_API_IS_SUBJECT_TO_CHANGE
#include <goa/goa.h>

#include "gd-miner-tracker.h"
#include "gd-utils.h"

G_BEGIN_DECLS

#define GD_TYPE_MINER               (gd_miner_get_type ())
#define GD_MINER(obj)                           (G_TYPE_CHECK_INSTANCE_CAST ((obj), GD_TYPE_MINER, GdMiner))
#define GD_MINER_CLASS(klass)                   (G_TYPE_CHECK_CLASS_CAST ((klass),  GD_TYPE_MINER, GdMinerClass))
#define GD_IS_MINER(obj)         (G_TYPE_CHECK_INSTANCE_TYPE ((obj), GD_TYPE_MINER))
#define GD_IS_MINER_CLASS(klass) (G_TYPE_CHECK_CLASS_TYPE ((klass),  GD_TYPE_MINER))
#define GD_MINER_GET_CLASS(obj)                 (G_TYPE_INSTANCE_GET_CLASS ((obj),  GD_TYPE_MINER, GdMinerClass))

typedef struct _GdMiner        GdMiner;
typedef struct _GdMinerClass   GdMinerClass;
typedef struct _GdMinerPrivate GdMinerPrivate;

typedef struct {
  GdMiner *miner;
  TrackerSparqlConnection *connection; /* borrowed from GdMiner */
  gulong miner_cancellable_id;

  GoaAccount *account;
  GObject *service;
  GSimpleAsyncResult *async_result;
  GCancellable *cancellable;

  GHashTable *previous_resources;
  gchar *datasource_urn;
} GdAccountMinerJob;

struct _GdMiner
{
  GObject parent;

  GdMinerPrivate *priv;
};

struct _GdMinerClass
{
  GObjectClass parent_class;

  char *goa_provider_type;
  char *miner_identifier;

  GObject * (*create_service) (GdMiner *self,
                               GoaObject *object);

  void (*query) (GdAccountMinerJob *job,
                 GError **error);
};

GType gd_miner_get_type (void);

void gd_miner_refresh_db_async (GdMiner *self,
                                GCancellable *cancellable,
                                GAsyncReadyCallback callback,
                                gpointer user_data);

gboolean gd_miner_refresh_db_finish (GdMiner *self,
                                     GAsyncResult *res,
                                     GError **error);

G_END_DECLS

#endif /* __GD_MINER_H__ */

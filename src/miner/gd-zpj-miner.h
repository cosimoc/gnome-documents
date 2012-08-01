/*
 * Copyright (c) 2012 Red Hat, Inc.
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
 * Author: Debarshi Ray <debarshir@gnome.org>
 *
 */

#ifndef __GD_ZPJ_MINER_H__
#define __GD_ZPJ_MINER_H__

#include <gio/gio.h>
#include "gd-miner.h"

G_BEGIN_DECLS

#define GD_TYPE_ZPJ_MINER gd_zpj_miner_get_type()

#define GD_ZPJ_MINER(obj) \
  (G_TYPE_CHECK_INSTANCE_CAST ((obj), \
   GD_TYPE_ZPJ_MINER, GdZpjMiner))

#define GD_ZPJ_MINER_CLASS(klass) \
  (G_TYPE_CHECK_CLASS_CAST ((klass), \
   GD_TYPE_ZPJ_MINER, GdZpjMinerClass))

#define GD_IS_ZPJ_MINER(obj) \
  (G_TYPE_CHECK_INSTANCE_TYPE ((obj), \
   GD_TYPE_ZPJ_MINER))

#define GD_IS_ZPJ_MINER_CLASS(klass) \
  (G_TYPE_CHECK_CLASS_TYPE ((klass), \
   GD_TYPE_ZPJ_MINER))

#define GD_ZPJ_MINER_GET_CLASS(obj) \
  (G_TYPE_INSTANCE_GET_CLASS ((obj), \
   GD_TYPE_ZPJ_MINER, GdZpjMinerClass))

typedef struct _GdZpjMiner GdZpjMiner;
typedef struct _GdZpjMinerClass GdZpjMinerClass;
typedef struct _GdZpjMinerPrivate GdZpjMinerPrivate;

struct _GdZpjMiner {
  GdMiner parent;

  GdZpjMinerPrivate *priv;
};

struct _GdZpjMinerClass {
  GdMinerClass parent_class;
};

GType gd_zpj_miner_get_type(void);

G_END_DECLS

#endif /* __GD_ZPJ_MINER_H__ */

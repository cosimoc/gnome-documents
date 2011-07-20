/*
 * Copyright (C) 2011 Red Hat, Inc.
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
 * Authors: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

#ifndef __GD_PDF_LOADER_H__
#define __GD_PDF_LOADER_H__

#include <glib-object.h>

G_BEGIN_DECLS

#define GD_TYPE_PDF_LOADER            (gd_pdf_loader_get_type ())
#define GD_PDF_LOADER(obj)            (G_TYPE_CHECK_INSTANCE_CAST ((obj), GD_TYPE_PDF_LOADER, GdPdfLoader))
#define GD_IS_PDF_LOADER(obj)         (G_TYPE_CHECK_INSTANCE_TYPE ((obj), GD_TYPE_PDF_LOADER))
#define GD_PDF_LOADER_CLASS(klass)    (G_TYPE_CHECK_CLASS_CAST ((klass),  GD_TYPE_PDF_LOADER, GdPdfLoaderClass))
#define GD_IS_PDF_LOADER_CLASS(klass) (G_TYPE_CHECK_CLASS_TYPE ((klass),  GD_TYPE_PDF_LOADER))
#define GD_PDF_LOADER_GET_CLASS(obj)  (G_TYPE_INSTANCE_GET_CLASS ((obj),  GD_TYPE_PDF_LOADER, GdPdfLoaderClass))

typedef struct _GdPdfLoader          GdPdfLoader;
typedef struct _GdPdfLoaderPrivate   GdPdfLoaderPrivate;
typedef struct _GdPdfLoaderClass     GdPdfLoaderClass;

struct _GdPdfLoader
{
  GObject parent_instance;

  GdPdfLoaderPrivate *priv;
};

struct _GdPdfLoaderClass
{
  GObjectClass parent_class;
};

GType    gd_pdf_loader_get_type     (void) G_GNUC_CONST;

GdPdfLoader *gd_pdf_loader_new (const gchar *uri);
void gd_pdf_loader_cleanup_document (GdPdfLoader *self);
void gd_pdf_loader_get_max_page_size (GdPdfLoader *self,
                                         gdouble *width,
                                         gdouble *height);


G_END_DECLS

#endif /* __GD_PDF_LOADER_H__ */

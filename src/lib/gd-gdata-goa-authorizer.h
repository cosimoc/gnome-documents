/*
 * e-gdata-goa-authorizer.h
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2 of the License, or (at your option) version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with the program; if not, see <http://www.gnu.org/licenses/>
 *
 */

#ifndef GD_GDATA_GOA_AUTHORIZER_H
#define GD_GDATA_GOA_AUTHORIZER_H

#include <gdata/gdata.h>
#include <goa/goa.h>

/* Standard GObject macros */
#define GD_TYPE_GDATA_GOA_AUTHORIZER \
	(gd_gdata_goa_authorizer_get_type ())
#define GD_GDATA_GOA_AUTHORIZER(obj) \
	(G_TYPE_CHECK_INSTANCE_CAST \
	((obj), GD_TYPE_GDATA_GOA_AUTHORIZER, GdGDataGoaAuthorizer))
#define GD_GDATA_GOA_AUTHORIZER_CLASS(cls) \
	(G_TYPE_CHECK_CLASS_CAST \
	((cls), GD_TYPE_GDATA_GOA_AUTHORIZER, GdGDataGoaAuthorizerClass))
#define GD_IS_GDATA_GOA_AUTHORIZER(obj) \
	(G_TYPE_CHECK_INSTANCE_TYPE \
	((obj), GD_TYPE_GDATA_GOA_AUTHORIZER))
#define GD_IS_GDATA_GOA_AUTHORIZER_CLASS(cls) \
	(G_TYPE_CHECK_CLASS_TYPE \
	((cls), GD_TYPE_GDATA_GOA_AUTHORIZER))
#define GD_GDATA_GOA_AUTHORIZER_GET_CLASS(obj) \
	(G_TYPE_INSTANCE_GET_CLASS \
	((obj), GD_TYPE_GDATA_GOA_AUTHORIZER, GdGDataGoaAuthorizerClass))

G_BEGIN_DECLS

typedef struct _GdGDataGoaAuthorizer GdGDataGoaAuthorizer;
typedef struct _GdGDataGoaAuthorizerClass GdGDataGoaAuthorizerClass;
typedef struct _GdGDataGoaAuthorizerPrivate GdGDataGoaAuthorizerPrivate;

struct _GdGDataGoaAuthorizer {
	GObject parent;
	GdGDataGoaAuthorizerPrivate *priv;
};

struct _GdGDataGoaAuthorizerClass {
	GObjectClass parent_class;
};

GType		gd_gdata_goa_authorizer_get_type (void);
GdGDataGoaAuthorizer *
		gd_gdata_goa_authorizer_new
					(GoaObject *goa_object);
GoaObject *	gd_gdata_goa_authorizer_get_goa_object
					(GdGDataGoaAuthorizer *authorizer);

#endif /* GD_GDATA_GOA_AUTHORIZER_H */

dnl -*- mode: m4 -*-
AC_PREREQ(2.63)
AC_INIT([gnome-documents],[0.5.3],[],[gnome-documents])

AM_CONFIG_HEADER(config/config.h)
AC_CONFIG_SRCDIR([src/main.js])
AC_CONFIG_MACRO_DIR([m4])
AC_CONFIG_AUX_DIR([config])

m4_ifdef([AM_SILENT_RULES],[AM_SILENT_RULES([yes])])

AC_CANONICAL_TARGET

# require automake 1.11
AM_INIT_AUTOMAKE([1.11 dist-xz no-dist-gzip tar-ustar foreign])
AM_MAINTAINER_MODE([enable])

GETTEXT_PACKAGE=AC_PACKAGE_NAME
AC_SUBST(GETTEXT_PACKAGE)
AC_DEFINE_UNQUOTED(GETTEXT_PACKAGE,"$GETTEXT_PACKAGE",[The name of the gettext domain])
IT_PROG_INTLTOOL(0.40.0)
PKG_PROG_PKG_CONFIG([0.22])

AM_GNU_GETTEXT([external])
AM_GNU_GETTEXT_VERSION([0.17])

GOBJECT_INTROSPECTION_REQUIRE([0.9.6])

## don't rerun to this point if we abort
AC_CACHE_SAVE

AC_PROG_CC
AM_PROG_CC_C_O
AC_PROG_CXX
AC_ISC_POSIX
AC_HEADER_STDC

# no stupid static libraries
AM_DISABLE_STATIC
# enable libtool
AC_PROG_LIBTOOL
# avoid libtool for LTCOMPILE, use it only to link

## don't rerun to this point if we abort
AC_CACHE_SAVE

GLIB_GSETTINGS

AC_CHECK_LIBM
AC_SUBST(LIBM)

EVINCE_MIN_VERSION=3.3.0
GLIB_MIN_VERSION=2.31.6
GTK_MIN_VERSION=3.5.5
GOBJECT_INTROSPECTION_MIN_VERSION=1.31.6
GDATA_MIN_VERSION=0.11.0
GOA_MIN_VERSION=3.2.0
CLUTTER_GTK_MIN_VERSION=1.0.2
TRACKER_MIN_VERSION=0.13.1
ZAPOJIT_MIN_VERSION=0.0.2

PKG_CHECK_MODULES(DOCUMENTS,
                  clutter-gtk-1.0 >= $CLUTTER_GTK_MIN_VERSION
                  evince-document-3.0 >= $EVINCE_MIN_VERSION
                  evince-view-3.0 >= $EVINCE_MIN_VERSION
                  gjs-1.0
                  glib-2.0 >= $GLIB_MIN_VERSION
                  gobject-introspection-1.0 >= $GOBJECT_INTROSPECTION_MIN_VERSION
                  gtk+-3.0 >= $GTK_MIN_VERSION
                  gnome-desktop-3.0
                  tracker-sparql-0.14 >= $TRACKER_MIN_VERSION
                  goa-1.0 >= $GOA_MIN_VERSION
                  libgdata >= $GDATA_MIN_VERSION
                  zapojit-0.0 >= $ZAPOJIT_MIN_VERSION
                  oauth)

PKG_CHECK_MODULES(MINER,
                  tracker-sparql-0.14 >= $TRACKER_MIN_VERSION
                  glib-2.0 >= $GLIB_MIN_VERSION
                  gio-2.0 >= $GLIB_MIN_VERSION
                  goa-1.0 >= $GOA_MIN_VERSION
                  libgdata >= $GDATA_MIN_VERSION
                  zapojit-0.0 >= $ZAPOJIT_MIN_VERSION
                  oauth)

GJS_CONSOLE=`$PKG_CONFIG --variable=gjs_console gjs-1.0`
AC_SUBST(GJS_CONSOLE)

AC_CONFIG_FILES([
Makefile
src/Makefile
data/Makefile
data/icons/Makefile
data/gnome-documents.desktop.in
po/Makefile.in
])

AC_OUTPUT

dnl ==========================================================================
echo "

        gnome-documents $VERSION
        ==================

        prefix:    ${prefix}
        compiler:  ${CC}

        Now type 'make' to build $PACKAGE
"

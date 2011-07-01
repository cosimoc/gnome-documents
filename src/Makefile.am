AM_CPPFLAGS = \
    -I$(top_builddir)/config \
    -I$(top_srcdir)	\
    -L$(top_srcdir)/src \
    -DGNOME_DOCUMENTS_LIBDIR=\"$(libdir)\" \
    -DGNOME_DOCUMENTS_DATADIR=\"$(datadir)\" \
    -DGNOME_DOCUMENTS_PKGDATADIR=\"$(pkgdatadir)\" \
    -DGNOME_DOCUMENTS_TOP_SRCDIR=\"$(abs_top_srcdir)\" \
    -DGNOME_DOCUMENTS_BUILDDIR=\"$(abs_top_builddir)\"

girdir = $(datadir)/gir-1.0
typelibdir = $(libdir)/girepository-1.0

BUILT_SOURCES =
EXTRA_DIST =
CLEANFILES =
lib_LTLIBRARIES =
INTROSPECTION_GIRS =
gir_DATA =
typelib_DATA =

# convenience command for doing Makefile variable substitutions in non-Makefile
# files (scripts, service files, etc.)
do_subst = sed -e 's|@abs_top_srcdir[@]|$(abs_top_srcdir)|g' \
               -e 's|@abs_top_builddir[@]|$(abs_top_builddir)|g' \
               -e 's|@localedir[@]|$(localedir)|g' \
               -e 's|@bindir[@]|$(bindir)|g' \
               -e 's|@libdir[@]|$(libdir)|g' \
               -e 's|@libexecdir[@]|$(libexecdir)|g' \
               -e 's|@pkglibdir[@]|$(pkglibdir)|g' \
               -e 's|@pkgdatadir[@]|$(pkgdatadir)|g'

include $(INTROSPECTION_MAKEFILE)
include Makefile-lib.am
include Makefile-js.am

# gsettingsschema_in_files = org.gnome.documents.gschema.xml.in
# gsettings_SCHEMAS = $(gsettingsschema_in_files:.xml.in=.xml)
# .PRECIOUS: $(gsettings_SCHEMAS)

# @INTLTOOL_XML_NOMERGE_RULE@
# @GSETTINGS_RULES@

gir_DATA += $(INTROSPECTION_GIRS)
typelib_DATA += $(gir_DATA:.gir=.typelib)

CLEANFILES += $(gir_DATA) $(typelib_DATA)

bin_SCRIPTS = gnome-documents

gnome-documents: gnome-documents.in
	$(AM_V_GEN) $(do_subst) $< > $@
	chmod +x $@

# CLEANFILES += gnome-documents \
#     $(gsettings_SCHEMAS)
# EXTRA_DIST += gnome-documents.in \
#     $(gsettingsschema_in_files)

CLEANFILES += gnome-documents
EXTRA_DIST += gnome-documents.in
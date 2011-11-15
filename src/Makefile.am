AM_CPPFLAGS = \
    -I$(top_builddir)/config \
    -I$(top_srcdir)	\
    -L$(top_srcdir)/src \
    -DGNOME_DOCUMENTS_LIBDIR=\"$(libdir)\" \
    -DGNOME_DOCUMENTS_DATADIR=\"$(datadir)\" \
    -DGNOME_DOCUMENTS_PKGDATADIR=\"$(pkgdatadir)\" \
    -DGNOME_DOCUMENTS_TOP_SRCDIR=\"$(abs_top_srcdir)\" \
    -DGNOME_DOCUMENTS_BUILDDIR=\"$(abs_top_builddir)\"

girdir = $(pkgdatadir)/gir-1.0
typelibdir = $(pkglibdir)/girepository-1.0

BUILT_SOURCES =
EXTRA_DIST =
CLEANFILES =
pkglib_LTLIBRARIES =
INTROSPECTION_GIRS =
gir_DATA =
typelib_DATA =
libexec_PROGRAMS =
libexec_SCRIPTS =

# convenience command for doing Makefile variable substitutions in non-Makefile
# files (scripts, service files, etc.)
do_subst = sed -e 's|@abs_top_srcdir[@]|$(abs_top_srcdir)|g' \
               -e 's|@abs_top_builddir[@]|$(abs_top_builddir)|g' \
               -e 's|@localedir[@]|$(localedir)|g' \
               -e 's|@bindir[@]|$(bindir)|g' \
               -e 's|@libdir[@]|$(libdir)|g' \
               -e 's|@libexecdir[@]|$(libexecdir)|g' \
               -e 's|@pkglibdir[@]|$(pkglibdir)|g' \
               -e 's|@pkgdatadir[@]|$(pkgdatadir)|g' \
               -e 's|@GJS_CONSOLE[@]|$(GJS_CONSOLE)|g'

include $(INTROSPECTION_MAKEFILE)
include Makefile-lib.am
include Makefile-miner.am
include Makefile-js.am

gir_DATA += $(INTROSPECTION_GIRS)
typelib_DATA += $(gir_DATA:.gir=.typelib)

CLEANFILES += $(gir_DATA) $(typelib_DATA)

bin_SCRIPTS = gnome-documents
noinst_SCRIPTS = gnome-documents-debug

gnome-documents: gnome-documents.in
	$(AM_V_GEN) $(do_subst) $< > $@
	chmod +x $@
gnome-documents-debug: gnome-documents-debug.in
	$(AM_V_GEN) $(do_subst) $< > $@
	chmod +x $@

CLEANFILES += \
    gnome-documents \
    gnome-documents-debug
EXTRA_DIST += \
    gnome-documents.in \
    gnome-documents-debug.in

libexec_SCRIPTS += gnome-documents-search-provider

gnome-documents-search-provider: gnome-documents-search-provider.in
	$(AM_V_GEN) $(do_subst) $< > $@
	chmod +x $@

CLEANFILES += gnome-documents-search-provider
EXTRA_DIST += gnome-documents-search-provider.in

service_in_files = org.gnome.Documents.SearchProvider.service.in

servicedir = $(datadir)/dbus-1/services
service_DATA = $(service_in_files:.service.in=.service)

%.service: %.service.in Makefile
	$(AM_V_GEN) [ -d $(@D) ] || $(mkdir_p) $(@D) ; \
	            sed -e "s|\@libexecdir\@|$(libexecdir)|" $< > $@.tmp && mv $@.tmp $@

CLEANFILES = += $(service_DATA)
EXTRA_DIST += $(service_in_files)

SUBDIRS = icons

desktopdir = $(datadir)/applications
desktop_DATA = $(desktop_in_files:.desktop.in=.desktop)
desktop_in_files = gnome-documents.desktop.in

searchproviderdir = $(datadir)/gnome-shell/search-providers
searchprovider_DATA = gnome-documents-search-provider.ini
searchprovider_in_files = gnome-documents-search-provider.ini.in

@INTLTOOL_DESKTOP_RULE@

%.ini: %.ini.in
	LC_ALL=C $(INTLTOOL_MERGE) -d -u -c $(top_builddir)/po/.intltool-merge-cache $(top_srcdir)/po $< $@

servicedir = $(datadir)/dbus-1/services
service_DATA = $(service_in_files:.service.in=.service)
$(service_DATA): $(service_in_files) Makefile
	$(AM_V_GEN)	\
		[ -d $(@D) ] || $(mkdir_p) $(@D) ; \
		sed -e "s|\@libexecdir\@|$(libexecdir)|" $< > $@.tmp && mv $@.tmp $@

service_in_files = org.gnome.Documents.GDataMiner.service.in

gsettings_ENUM_NAMESPACE = org.gnome.Documents
gsettings_ENUM_FILES = \
    $(top_srcdir)/src/lib/gd-main-view.h

gsettingsschema_in_files = org.gnome.documents.gschema.xml.in
gsettings_SCHEMAS = $(gsettingsschema_in_files:.xml.in=.xml)
.PRECIOUS: $(gsettings_SCHEMAS)

iconsdir = $(pkgdatadir)/icons
dist_icons_DATA = \
    thumbnail-frame.png

@INTLTOOL_XML_NOMERGE_RULE@
@GSETTINGS_RULES@

EXTRA_DIST= \
    gnome-documents.desktop \
    $(service_in_files) \
    $(desktop_in_files) \
    $(searchprovider_in_files) \
    $(gsettingsschema_in_files)

CLEANFILES = \
    $(desktop_DATA) \
    $(searchprovider_DATA) \
    $(gsettings_SCHEMAS) \
    $(service_DATA)

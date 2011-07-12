const Gd = imports.gi.Gd;
const GLib = imports.gi.GLib;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Main = imports.main;
const MainToolbar = imports.mainToolbar;
const TrackerModel = imports.trackerModel;
const _ = imports.gettext.gettext;

const _WINDOW_DEFAULT_WIDTH = 860;
const _WINDOW_DEFAULT_HEIGHT = 600;

const _VIEW_ITEM_WIDTH = 152;
const _VIEW_ITEM_WRAP_WIDTH = 140;
const _VIEW_COLUMN_SPACING = 20;
const _VIEW_COLUMNS = 4;
const _VIEW_MARGIN = 16;

const _SEARCH_ENTRY_TIMEOUT = 200;

function MainWindow() {
    this._init();
}

MainWindow.prototype = {
    _init: function() {
        this._initGtkWindow();
        this._initUi();
        this._initModel();
    },

    _initGtkWindow: function() {
        this.window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL,
                                       window_position: Gtk.WindowPosition.CENTER,
                                       resizable: false,
                                       title: _('Documents') });

        this.window.set_size_request(_WINDOW_DEFAULT_WIDTH, _WINDOW_DEFAULT_HEIGHT);
        this.window.connect('delete-event',
                            Lang.bind(this, this._onDeleteEvent));

        Main.settings.connect('changed::list-view', Lang.bind(this, function() {
            this._refreshViewSettings(true)
        }));

        this._refreshViewSettings(false);
    },

    _initTagBar: function() {
        this._tagBar = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                      hexpand: true,
                                      valign: Gtk.Align.END,
                                      margin_left: 12,
                                      margin_right: 12,
                                      margin_bottom: 12,
                                      column_spacing: 6,
                                      border_width: 6 });

        this._tagLabel = new Gtk.Label({ halign: Gtk.Align.START });
        this._tagBar.add(this._tagLabel);

        this._tagEntry = new Gtk.Entry({ hexpand: true });
        this._tagBar.add(this._tagEntry);

        this._overlay.add_overlay(this._tagBar);
    },

    _destroyView: function() {
        if (this.view) {
            this.view.destroy();
        }
    },

    _initIconView: function() {
        this._destroyView();

        this.view = new Gtk.IconView({ hexpand: true,
                                       vexpand: true });

        this.view.item_width = _VIEW_ITEM_WIDTH;
        this.view.column_spacing = _VIEW_COLUMN_SPACING;
        this.view.columns = _VIEW_COLUMNS;
        this.view.margin = _VIEW_MARGIN;
        this.view.set_selection_mode(Gtk.SelectionMode.MULTIPLE);

        this.view.connect('item-activated', Lang.bind(this, this._onViewItemActivated));
        this.view.connect('selection-changed', Lang.bind(this, this._onIconViewSelectionChanged));

        this.view.show();
    },

    _initListView: function() {
        this._destroyView();

        this.view = new Gtk.TreeView({ hexpand: true,
                                       vexpand: true });

        this.view.get_selection().set_mode(Gtk.SelectionMode.MULTIPLE);

        this.view.connect('row-activated', Lang.bind(this, this._onViewItemActivated));
        this.view.get_selection().connect('changed', Lang.bind(this, this._onListViewSelectionChanged));

        this.view.show();
    },

    _initUi: function() {
        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                    vexpand: true });
        this.window.add(this._grid);

        this._searchTimeout = 0;
        this.toolbar = new MainToolbar.MainToolbar();
        this.toolbar.setOverview();
        this.toolbar.searchEntry.connect('changed', 
                                         Lang.bind(this, this._onSearchEntryChanged));

        this._grid.add(this.toolbar.toolbar);

        this._scrolledWin = new Gtk.ScrolledWindow({ hexpand: true,
                                                     vexpand: true });
        this._overlay = new Gtk.Overlay();
        this._overlay.add(this._scrolledWin);

        this._initTagBar();

        this._grid.add(this._overlay);

        this._loadMore = new Gtk.Button();
        this._loadMore.connect('clicked', Lang.bind(this, function() {
            this._model.loadMore();
        }));

        this._viewBox = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
        this._viewBox.add(this._loadMore);

        this._createViewForSettings();

        this._scrolledWin.add_with_viewport(this._viewBox);

        this._grid.show_all();
        this._tagBar.hide();
    },

    _initModel: function() {
        this._model = new TrackerModel.TrackerModel(Lang.bind(this, this._onModelCreated));
        this._model.connect('count-updated', Lang.bind(this, this._onModelCountUpdated));
    },

    _createViewForSettings: function() {
        if (this._settingsList)
            this._initListView();
        else
            this._initIconView();

        this._viewBox.attach_next_to(this.view, this._loadMore, Gtk.PositionType.TOP, 1, 1);
    },

    _refreshViewSettings: function(reset) {
        this._settingsList = Main.settings.get_boolean('list-view');

        if (!reset)
            return;

        this._createViewForSettings();
        this._setModelView();
    },

    _createIconViewRenderers: function() {
        let pixbufRenderer = new Gd.FramedPixbufRenderer({ xalign: 0.5,
                                                           yalign: 0.5 });

        this.view.pack_start(pixbufRenderer, false);
        this.view.add_attribute(pixbufRenderer,
                                'pixbuf', TrackerModel.ModelColumns.ICON);

        this._renderer = new Gd.TwoLinesRenderer({ alignment: Pango.Alignment.CENTER,
                                                   wrap_mode: Pango.WrapMode.WORD_CHAR,
                                                   wrap_width: _VIEW_ITEM_WRAP_WIDTH,
                                                   xalign: 0.5,
                                                   yalign: 0.0,
                                                   text_lines: 3 });
        this.view.pack_start(this._renderer, false);
        this.view.add_attribute(this._renderer,
                                'text', TrackerModel.ModelColumns.TITLE);
        this.view.add_attribute(this._renderer,
                                'line-two', TrackerModel.ModelColumns.AUTHOR);
    },

    _createListViewRenderers: function() {
        let col = new Gtk.TreeViewColumn();
        this.view.append_column(col);

        let pixbufRenderer = new Gd.FramedPixbufRenderer({ xalign: 0.5,
                                                           yalign: 0.5 });

        col.pack_start(pixbufRenderer, false);
        col.add_attribute(pixbufRenderer,
                          'pixbuf', TrackerModel.ModelColumns.ICON);

        this._renderer = new Gd.TwoLinesRenderer({ alignment: Pango.Alignment.CENTER,
                                                   wrap_mode: Pango.WrapMode.WORD_CHAR,
                                                   wrap_width: _VIEW_ITEM_WRAP_WIDTH,
                                                   xalign: 0.5,
                                                   yalign: 0.0,
                                                   text_lines: 3 });
        col.pack_start(this._renderer, false);
        col.add_attribute(this._renderer,
                          'text', TrackerModel.ModelColumns.TITLE);
        col.add_attribute(this._renderer,
                          'line-two', TrackerModel.ModelColumns.AUTHOR);
    },

    _setModelView: function() {
        this.view.set_model(this._model.model);

        if (this._settingsList)
            this._createListViewRenderers();
        else
            this._createIconViewRenderers();
    },

    _onModelCreated: function() {
        this._setModelView();
        this._model.populateForOverview();
    },

    _onDeleteEvent: function() {
        Main.application.quit();
    },

    _onListViewSelectionChanged: function(treeSelection) {
        let selection = treeSelection.get_selected_rows()[0];
        this._showOrHideTagToolbar(selection);
    },

    _onIconViewSelectionChanged: function(view) {
        let selection = this.view.get_selected_items();
        this._showOrHideTagToolbar(selection);
    },

    _onViewItemActivated: function(view, path, column) {
        let iter = this._model.model.get_iter(path)[1];
        let uri = this._model.model.get_value(iter, TrackerModel.ModelColumns.URI);

        try {
            Gtk.show_uri(null, uri, Gtk.get_current_event_time());
        } catch (e) {
            log('Unable to open ' + uri + ': ' + e.toString())
        }
    },

    _onSearchEntryChanged: function() {
        if (this._searchTimeout != 0) {
            GLib.source_remove(this._searchTimeout)
            this._searchTimeout = 0;
        }

        this._searchTimeout = Mainloop.timeout_add(_SEARCH_ENTRY_TIMEOUT,
                                                   Lang.bind(this, this._onSearchEntryTimeout));
    },

    _onSearchEntryTimeout: function() {
        this._searchTimeout = 0;

        let text = this.toolbar.searchEntry.get_text();
        this._model.setFilter(text);
    },

    _onModelCountUpdated: function(model, itemCount, offset) {
        let remainingDocs = itemCount - (offset + TrackerModel.OFFSET_STEP);

        if (remainingDocs <= 0) {
            this._loadMore.hide();
            return;
        }

        if (remainingDocs > TrackerModel.OFFSET_STEP)
            remainingDocs = TrackerModel.OFFSET_STEP;

        this._loadMore.label = _('Load %d more documents').format(remainingDocs);
        this._loadMore.show();
    },

    _showOrHideTagToolbar: function(selection) {
        if (selection.length > 0) {
            this._tagBar.show();
            this._tagLabel.label = _('%d selected documents').format(selection.length);
        } else {
            this._tagBar.hide();
        }
    },
}

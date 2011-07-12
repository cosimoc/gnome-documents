const Gtk = imports.gi.Gtk;
const Gd = imports.gi.Gd;
const Pango = imports.gi.Pango;

const TrackerModel = imports.trackerModel;
const View = imports.view;
const Lang = imports.lang;

function ListView(window) {
    this._init(window);
}

ListView.prototype = {
    __proto__: View.View.prototype,

    _init: function(window) {
        View.View.prototype._init.call(this, window);

        this.view = new Gtk.TreeView({ hexpand: true,
                                       vexpand: true });

        this.view.get_selection().set_mode(Gtk.SelectionMode.MULTIPLE);

        this.view.connect('row-activated', Lang.bind(this, this._onItemActivated));
        this.view.get_selection().connect('changed', Lang.bind(this, this._onSelectionChanged));

        this.view.show();
    },

    _onItemActivated: function(view, path, column) {
        this.activateItem(path);
    },

    _onSelectionChanged: function(treeSelection) {
        let selection = treeSelection.get_selected_rows()[0];
        this.window.showOrHideTagToolbar(selection);
    },

    createRenderers: function() {
        let col = new Gtk.TreeViewColumn();
        this.view.append_column(col);

        let pixbufRenderer = 
            new Gd.FramedPixbufRenderer({ xalign: 0.5,
                                          yalign: 0.5 });

        col.pack_start(pixbufRenderer, false);
        col.add_attribute(pixbufRenderer,
                          'pixbuf', TrackerModel.ModelColumns.ICON);

        let textRenderer = 
            new Gd.TwoLinesRenderer({ alignment: Pango.Alignment.CENTER,
                                      wrap_mode: Pango.WrapMode.WORD_CHAR,
                                      xalign: 0.5,
                                      yalign: 0.0,
                                      xpad: 12,
                                      text_lines: 3 });
        col.pack_start(textRenderer, false);
        col.add_attribute(textRenderer,
                          'text', TrackerModel.ModelColumns.TITLE);
        col.add_attribute(textRenderer,
                          'line-two', TrackerModel.ModelColumns.AUTHOR);
    }
}